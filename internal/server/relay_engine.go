package server

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/router"
)

// relayOutcome carries a successful upstream response into the per-mode
// consumer (buffered relay normalizes the whole body; stream relay forwards
// SSE chunks as they arrive).
type relayOutcome struct {
	attempt *billingAttempt
	ch      provider.Channel
	res     *http.Response
	started time.Time
}

// relayLoop is the single retry loop shared by buffered and streaming relays:
// pick a channel, build the upstream request, reserve billing, send it, and
// classify failures. On a 2xx-3xx response it hands the result to consume,
// which settles usage and produces the response. On exhaustion it records the
// trace and optionally notifies the key owner (buffered relays only).
func (s *Server) relayLoop(r *http.Request, k APIKey, requested, routed, path string, body []byte, affinity string, stream, notifyFailure bool, consume func(out relayOutcome, trace *router.Trace) (relayMeta, error)) (relayMeta, error) {
	channels, err := s.keyChannels(r, k, routed)
	if err != nil || len(channels) == 0 {
		return relayMeta{}, fmt.Errorf("no channel serves model %q", routed)
	}
	trace := router.Trace{Time: time.Now(), Workspace: k.WorkspaceID, Affinity: affinity, Model: requested, RoutedModel: routed}
	for _, c := range channels {
		trace.Order = append(trace.Order, c.ID)
	}
	remaining := append([]provider.Channel(nil), channels...)
	aKey := affinityKey(k.WorkspaceID, affinity)
	var billingErr error
	for len(remaining) > 0 {
		ch, err := s.Router.ChooseFor(remaining, aKey)
		if err != nil {
			break
		}
		req, requestBody, skip, rerr := s.relayRequest(r.Context(), ch, routed, path, r.Header.Get("Content-Type"), body, stream)
		if skip {
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		if rerr != nil {
			return relayMeta{}, rerr
		}
		attempt, billErr := s.beginBilling(r, k, ch, requestBody, routed)
		if billErr != nil {
			billingErr = billErr
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		started := time.Now()
		res, err := s.doUpstream(req)
		if err != nil {
			s.releaseBilling(attempt, r.Context())
			s.restChannel(r.Context(), ch, "network", 0, time.Minute)
			trace.Tries = append(trace.Tries, router.Try{Channel: ch.ID, Reason: "network", Millis: time.Since(started).Milliseconds()})
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		if res.StatusCode < 200 || res.StatusCode >= 400 {
			rb, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
			res.Body.Close()
			s.releaseBilling(attempt, r.Context())
			reason, d := router.ClassifyFailure(res.StatusCode, res.Header, rb)
			if d > 0 {
				s.restChannel(r.Context(), ch, reason, res.StatusCode, d)
			}
			trace.Tries = append(trace.Tries, router.Try{Channel: ch.ID, Status: res.StatusCode, Reason: reason, Millis: time.Since(started).Milliseconds()})
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		meta, consumeErr := consume(relayOutcome{attempt: attempt, ch: ch, res: res, started: started}, &trace)
		s.releaseBilling(attempt, r.Context())
		return meta, consumeErr
	}
	s.Router.AddTrace(trace)
	if notifyFailure {
		s.notifyFailedRequest(k, "CAPI request failed", fmt.Sprintf("A request for model %s failed across all available channels.", requested))
	}
	if billingErr != nil {
		return relayMeta{}, billingErr
	}
	return relayMeta{}, fmt.Errorf("all channels failed")
}

// relayRequest builds the upstream request for one candidate channel.
// skip=true drops this channel and tries the next (the channel cannot serve
// this request); an error aborts the whole relay.
func (s *Server) relayRequest(ctx context.Context, ch provider.Channel, routed, path, contentType string, body []byte, stream bool) (req *http.Request, requestBody []byte, skip bool, err error) {
	var upstreamModel string
	ch, upstreamModel, requestBody, err = prepareChannelRequest(ch, routed, body, contentType)
	if err != nil {
		return nil, nil, false, err
	}
	requestPath, requestBody, protocolAuth, err := provider.PrepareProtocolRequest(ch, path, upstreamModel, requestBody)
	if err != nil {
		return nil, nil, false, err
	}
	if ch.Protocol == "chatgpt-subscription" {
		if path != "/v1/responses" {
			return nil, nil, true, nil
		}
		requestBody, err = codexBody(requestBody, stream)
		if err != nil {
			return nil, nil, true, nil
		}
		requestPath = "/responses"
	}
	if (ch.Protocol == "anthropic" || ch.Protocol == "gemini") && path == "/v1/chat/completions" {
		var nativePath string
		requestBody, nativePath, err = adaptRequest("openai", ch.Protocol, upstreamModel, requestBody, stream)
		if err != nil {
			return nil, nil, true, nil
		}
		req, err = s.newProtocolRequest(ctx, ch, upstreamModel, nativePath, requestBody, stream)
		if err != nil {
			return nil, nil, false, err
		}
	} else {
		target := upstreamURL(ch.BaseURL, requestPath)
		if ch.Protocol == "chatgpt-subscription" {
			target = provider.CodexBase + "/responses"
		}
		req, err = http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(requestBody))
		if err != nil {
			return nil, nil, false, err
		}
		if stream {
			req.Header.Set("Content-Type", "application/json")
		} else if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		} else {
			req.Header.Set("Content-Type", "application/json")
		}
		if ch.Protocol == "chatgpt-subscription" {
			updated, signErr := provider.SignCodexRequest(req, []byte(ch.APIKey))
			if signErr != nil {
				s.restChannel(ctx, ch, "auth", 401, 10*time.Minute)
				return nil, nil, true, nil
			}
			if len(updated) > 0 && string(updated) != ch.APIKey {
				_ = s.saveSubscriptionCredentials(ctx, ch.ID, updated)
			}
		} else if ch.APIKey != "" {
			req.Header.Set("Authorization", "Bearer "+ch.APIKey)
		}
	}
	provider.ApplyProtocolAuth(req, ch, protocolAuth)
	provider.ApplyChannelHeaders(req, ch)
	return req, requestBody, false, nil
}
