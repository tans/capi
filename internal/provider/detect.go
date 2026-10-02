package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Detection struct {
	Protocol string `json:"protocol"`
	Base     string `json:"base,omitempty"`
	Model    string `json:"model,omitempty"`
	OK       bool   `json:"ok"`
	Status   int    `json:"status,omitempty"`
	Millis   int64  `json:"ms"`
	Error    string `json:"error,omitempty"`
}

var detectionProtocols = []string{"openai", "responses", "anthropic", "gemini"}

// Detect probes each supported upstream API in parallel without persisting the
// result. A detection is intentionally a real, tiny request so a 200 response
// means the provider can actually accept that protocol and model.
func Detect(ctx context.Context, ch Channel, base, model string) []Detection {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	model = strings.TrimSpace(model)
	if model == "" && len(ch.Models) > 0 {
		model = ch.Models[0]
	}
	out := make([]Detection, len(detectionProtocols))
	var wg sync.WaitGroup
	for i, protocol := range detectionProtocols {
		out[i] = Detection{Protocol: protocol, Base: detectBase(base, protocol), Model: model}
		if out[i].Base == "" || model == "" {
			out[i].Error = "base URL and model are required"
			continue
		}
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			out[i] = probeDetection(ctx, ch, out[i])
		}(i)
	}
	wg.Wait()
	return out
}

func detectBase(base, protocol string) string {
	for _, suffix := range []string{"/chat/completions", "/responses", "/v1/messages", "/messages", "/generateContent"} {
		base = strings.TrimSuffix(base, suffix)
	}
	if base == "" {
		return ""
	}
	u, err := url.Parse(base)
	if err != nil || u.Host == "" {
		return ""
	}
	if protocol == "anthropic" {
		return strings.TrimSuffix(base, "/v1")
	}
	if protocol == "gemini" {
		return strings.TrimSuffix(base, "/v1beta")
	}
	if strings.Trim(u.Path, "/") == "" {
		return base + "/v1"
	}
	return base
}

func probeDetection(ctx context.Context, ch Channel, detection Detection) Detection {
	body, endpoint := detectionBody(detection.Protocol, detection.Base, detection.Model)
	if endpoint == "" {
		detection.Error = "unsupported protocol"
		return detection
	}
	reqCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		detection.Error = err.Error()
		return detection
	}
	req.Header.Set("Content-Type", "application/json")
	switch detection.Protocol {
	case "anthropic":
		req.Header.Set("anthropic-version", "2023-06-01")
		req.Header.Set("x-api-key", ch.APIKey)
	case "gemini":
		req.Header.Set("x-goog-api-key", ch.APIKey)
	default:
		req.Header.Set("Authorization", "Bearer "+ch.APIKey)
	}
	ApplyChannelHeaders(req, ch)
	started := time.Now()
	res, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	detection.Millis = time.Since(started).Milliseconds()
	if err != nil {
		detection.Error = strings.TrimPrefix(err.Error(), "Post \""+endpoint+"\": ")
		return detection
	}
	defer res.Body.Close()
	detection.Status = res.StatusCode
	if res.StatusCode >= 200 && res.StatusCode < 300 {
		detection.OK = true
		return detection
	}
	errorBody, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	detection.Error = fmt.Sprintf("%s: %s", res.Status, strings.TrimSpace(string(errorBody)))
	return detection
}

func detectionBody(protocol, base, model string) ([]byte, string) {
	var body any
	var endpoint string
	switch protocol {
	case "openai":
		endpoint = strings.TrimRight(base, "/") + "/chat/completions"
		body = map[string]any{"model": model, "messages": []any{map[string]string{"role": "user", "content": "hi"}}, "max_tokens": 1}
	case "responses":
		endpoint = strings.TrimRight(base, "/") + "/responses"
		body = map[string]any{"model": model, "input": "hi", "max_output_tokens": 1}
	case "anthropic":
		endpoint = strings.TrimRight(base, "/") + "/v1/messages"
		body = map[string]any{"model": model, "max_tokens": 1, "messages": []any{map[string]string{"role": "user", "content": "hi"}}}
	case "gemini":
		endpoint = strings.TrimRight(base, "/") + "/v1beta/models/" + url.PathEscape(model) + ":generateContent"
		body = map[string]any{"contents": []any{map[string]any{"parts": []any{map[string]string{"text": "hi"}}}}}
	default:
		return nil, ""
	}
	encoded, _ := json.Marshal(body)
	return encoded, endpoint
}
