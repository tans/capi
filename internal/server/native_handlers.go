package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/protocol"
	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/router"
)

func (s *Server) handleAnthropic(w http.ResponseWriter, r *http.Request, raw []byte, k APIKey, model string, stream bool) {
	if stream {
		s.protocolStream(w, r, k, "anthropic", model, raw)
		return
	}
	out, err := s.protocolBuffered(r, k, "anthropic", model, raw)
	if err != nil {
		writeRelayError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(out)
}

func (s *Server) geminiDispatch(w http.ResponseWriter, r *http.Request) {
	rest := r.PathValue("rest")
	stream := false
	model := ""
	switch {
	case strings.HasSuffix(rest, ":streamGenerateContent"):
		stream = true
		model = strings.TrimSuffix(rest, ":streamGenerateContent")
	case strings.HasSuffix(rest, ":generateContent"):
		model = strings.TrimSuffix(rest, ":generateContent")
	default:
		apiError(w, 404, "not_found", "Unsupported Gemini method.")
		return
	}
	s.handleGeminiModel(w, r, model, stream)
}
func (s *Server) handleGeminiModel(w http.ResponseWriter, r *http.Request, model string, stream bool) {
	k, err := s.authenticateAPI(r, "llm.chat")
	if err != nil {
		apiError(w, 401, "unauthorized", err.Error())
		return
	}
	raw, _ := io.ReadAll(io.LimitReader(r.Body, 16<<20))
	if model == "" {
		apiError(w, 400, "invalid_request", "model required.")
		return
	}
	if stream {
		s.protocolStream(w, r, k, "gemini", model, raw)
		return
	}
	out, err := s.protocolBuffered(r, k, "gemini", model, raw)
	if err != nil {
		writeRelayError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(out)
}

func (s *Server) protocolBuffered(r *http.Request, k APIKey, clientProto, model string, raw []byte) ([]byte, error) {
	channels, err := s.keyChannels(r, k, model)
	if err != nil || len(channels) == 0 {
		return nil, fmt.Errorf("no channel serves model %q", model)
	}
	remaining := append([]provider.Channel(nil), channels...)
	var billingErr error
	for len(remaining) > 0 {
		ch, err := s.Router.ChooseFor(remaining, "")
		if err != nil {
			break
		}
		ch, upstreamModel, requestRaw, err := provider.PrepareChannel(ch, model, raw)
		if err != nil {
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		reqBody, path, err := adaptRequest(clientProto, ch.Protocol, upstreamModel, requestRaw, false)
		if err != nil {
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		req, err := s.newProtocolRequest(r.Context(), ch, upstreamModel, path, reqBody, false)
		if err != nil {
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		attempt, billErr := s.beginBilling(r, k, ch, reqBody, model)
		if billErr != nil {
			billingErr = billErr
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		defer s.releaseBilling(attempt)
		started := time.Now()
		res, err := s.doUpstream(req)
		if err != nil {
			s.releaseBilling(attempt)
			s.restChannel(ch, "network", 0, time.Minute)
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(res.Body, 64<<20))
		res.Body.Close()
		if res.StatusCode < 200 || res.StatusCode >= 400 {
			s.releaseBilling(attempt)
			reason, d := router.ClassifyFailure(res.StatusCode, res.Header, body)
			if d > 0 {
				s.restChannel(ch, reason, res.StatusCode, d)
			}
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		s.Router.Clear(ch.ID)
		openai, err := responseToOpenAI(ch.Protocol, body)
		if err != nil {
			return nil, err
		}
		usage, served := usageFromBody(openai)
		if err := s.recordUsageDetailed(attempt, k, ch, model, model, served, "/"+clientProto, res.StatusCode, usage, time.Since(started), 0, ""); err != nil {
			return nil, err
		}
		switch clientProto {
		case "anthropic":
			return protocol.OpenAIToAnthropic(openai)
		case "gemini":
			return protocol.OpenAIToGemini(openai)
		}
		return openai, nil
	}
	if billingErr != nil {
		return nil, billingErr
	}
	return nil, fmt.Errorf("all channels failed")
}

func (s *Server) protocolStream(w http.ResponseWriter, r *http.Request, k APIKey, clientProto, model string, raw []byte) {
	channels, err := s.keyChannels(r, k, model)
	if err != nil || len(channels) == 0 {
		apiError(w, 502, "upstream_error", fmt.Sprintf("no channel serves model %q", model))
		return
	}
	remaining := append([]provider.Channel(nil), channels...)
	var billingErr error
	for len(remaining) > 0 {
		ch, err := s.Router.ChooseFor(remaining, "")
		if err != nil {
			break
		}
		ch, upstreamModel, requestRaw, err := provider.PrepareChannel(ch, model, raw)
		if err != nil {
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		reqBody, path, err := adaptRequest(clientProto, ch.Protocol, upstreamModel, requestRaw, true)
		if err != nil {
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		req, err := s.newProtocolRequest(r.Context(), ch, upstreamModel, path, reqBody, true)
		if err != nil {
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		attempt, billErr := s.beginBilling(r, k, ch, reqBody, model)
		if billErr != nil {
			billingErr = billErr
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		defer s.releaseBilling(attempt)
		started := time.Now()
		res, err := s.doUpstream(req)
		if err != nil {
			s.releaseBilling(attempt)
			s.restChannel(ch, "network", 0, time.Minute)
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		if res.StatusCode < 200 || res.StatusCode >= 400 {
			body, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
			res.Body.Close()
			s.releaseBilling(attempt)
			reason, d := router.ClassifyFailure(res.StatusCode, res.Header, body)
			if d > 0 {
				s.restChannel(ch, reason, res.StatusCode, d)
			}
			remaining = removeChannel(remaining, ch.ID)
			continue
		}
		s.Router.Clear(ch.ID)
		defer res.Body.Close()
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Accel-Buffering", "no")
		w.WriteHeader(200)
		flusher, _ := w.(http.Flusher)
		anthropicEncoder := &protocol.AnthropicStreamEncoder{ID: "msg_" + auth.RandomID(""), Model: model}
		geminiEncoder := &protocol.GeminiStreamEncoder{Model: model}
		openaiEncoder := &protocol.OpenAIStreamEncoder{ID: "chatcmpl_" + auth.RandomID(""), Model: model}
		var terminal []protocol.Event
		send := func(ev protocol.Event) error {
			var chunks [][]byte
			switch clientProto {
			case "anthropic":
				chunks = anthropicEncoder.Encode(ev)
			case "gemini":
				b := geminiEncoder.Encode(ev)
				if b != nil {
					chunks = [][]byte{b}
				}
			case "openai":
				b := openaiEncoder.Encode(ev)
				if b != nil {
					chunks = [][]byte{b}
				}
			}
			for _, b := range chunks {
				if s.Cfg.Redact {
					b = s.Redact.RestoreBytes(b)
				}
				if _, err := w.Write(b); err != nil {
					return err
				}
				if flusher != nil {
					flusher.Flush()
				}
			}
			return nil
		}
		emit := func(ev protocol.Event) error {
			if ev.Kind == protocol.EventDone {
				terminal = append(terminal, ev)
				return nil
			}
			return send(ev)
		}
		stats, err := readProtocolStream(ch.Protocol, res.Body, emit)
		lat := time.Since(started)
		ttft := time.Duration(0)
		if !stats.FirstEventAt.IsZero() {
			ttft = stats.FirstEventAt.Sub(started)
		}
		if err := s.recordUsageDetailed(attempt, k, ch, model, model, stats.ServedModel, "/"+clientProto, res.StatusCode, stats.Usage, lat, ttft, ""); err != nil {
			s.Log.Error("billing_settlement_failed", "error", err)
			writeStreamError(w, clientProto, "billing_settlement_failed", "Billing settlement could not be confirmed. Check billing records before retrying.")
			return
		}
		if err != nil {
			s.Log.Warn("protocol_stream_failed", "protocol", ch.Protocol, "error", err)
			writeStreamError(w, clientProto, "stream_interrupted", "The upstream stream was interrupted.")
			return
		}
		for _, ev := range terminal {
			if err := send(ev); err != nil {
				return
			}
		}
		return
	}
	if billingErr != nil {
		writeRelayError(w, billingErr)
		return
	}
	apiError(w, 502, "upstream_error", "all channels failed")
}

func readProtocolStream(protoName string, r io.Reader, fn func(protocol.Event) error) (protocol.StreamStats, error) {
	switch protoName {
	case "anthropic":
		return protocol.ReadAnthropicSSE(r, fn)
	case "gemini":
		return protocol.ReadGeminiSSE(r, fn)
	default:
		return protocol.ReadOpenAISSE(r, func(_ []byte, ev protocol.Event) error { return fn(ev) })
	}
}
func adaptRequest(clientProto, upstreamProto, model string, raw []byte, stream bool) ([]byte, string, error) {
	if clientProto == "anthropic" {
		if upstreamProto == "anthropic" {
			return raw, "/v1/messages", nil
		}
		openai, err := protocol.AnthropicToOpenAI(raw)
		if err != nil {
			return nil, "", err
		}
		openai = setStream(openai, stream)
		if upstreamProto == "gemini" {
			b, _, err := protocol.OpenAIRequestToGemini(openai)
			return b, geminiPath(model, stream), err
		}
		return openai, "/v1/chat/completions", nil
	}
	if clientProto == "gemini" {
		if upstreamProto == "gemini" {
			return raw, geminiPath(model, stream), nil
		}
		openai, err := protocol.GeminiToOpenAI(raw, model, stream)
		if err != nil {
			return nil, "", err
		}
		if upstreamProto == "anthropic" {
			b, err := protocol.OpenAIRequestToAnthropic(openai)
			return b, "/v1/messages", err
		}
		return openai, "/v1/chat/completions", nil
	}
	if clientProto == "openai" {
		raw = setStream(raw, stream)
		switch upstreamProto {
		case "anthropic":
			b, err := protocol.OpenAIRequestToAnthropic(raw)
			return b, "/v1/messages", err
		case "gemini":
			b, _, err := protocol.OpenAIRequestToGemini(raw)
			return b, geminiPath(model, stream), err
		default:
			return raw, "/v1/chat/completions", nil
		}
	}
	return raw, "/v1/chat/completions", nil
}
func setStream(body []byte, stream bool) []byte {
	var v map[string]any
	if json.Unmarshal(body, &v) == nil {
		v["stream"] = stream
		if b, err := json.Marshal(v); err == nil {
			return b
		}
	}
	return body
}
func geminiPath(model string, stream bool) string {
	m := url.PathEscape(model)
	if stream {
		return "/v1beta/models/" + m + ":streamGenerateContent?alt=sse"
	}
	return "/v1beta/models/" + m + ":generateContent"
}
func (s *Server) newProtocolRequest(ctx context.Context, ch provider.Channel, model, path string, body []byte, stream bool) (*http.Request, error) {
	base := strings.TrimRight(ch.BaseURL, "/")
	target := upstreamURL(base, path)
	if ch.Protocol == "anthropic" {
		if strings.HasSuffix(base, "/v1") {
			base = strings.TrimSuffix(base, "/v1")
		}
		target = base + path
	}
	if ch.Protocol == "gemini" {
		if strings.HasSuffix(base, "/v1beta") {
			base = strings.TrimSuffix(base, "/v1beta")
		}
		target = base + path
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	switch ch.Protocol {
	case "anthropic":
		if ch.APIKey != "" {
			req.Header.Set("x-api-key", ch.APIKey)
		}
		req.Header.Set("anthropic-version", "2023-06-01")
	case "gemini":
		if ch.APIKey != "" {
			req.Header.Set("x-goog-api-key", ch.APIKey)
		}
	default:
		if ch.APIKey != "" {
			req.Header.Set("Authorization", "Bearer "+ch.APIKey)
		}
	}
	if stream {
		req.Header.Set("Accept", "text/event-stream")
	}
	provider.ApplyChannelHeaders(req, ch)
	return req, nil
}
func responseToOpenAI(protoName string, body []byte) ([]byte, error) {
	switch protoName {
	case "anthropic":
		return protocol.AnthropicResponseToOpenAI(body)
	case "gemini":
		return protocol.GeminiResponseToOpenAI(body)
	default:
		return body, nil
	}
}
