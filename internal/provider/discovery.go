package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type DiscoveredModel struct {
	ID               string   `json:"id"`
	Context          int      `json:"context,omitempty"`
	InputModalities  []string `json:"input_modalities,omitempty"`
	OutputModalities []string `json:"output_modalities,omitempty"`
}

func DiscoverModels(ctx context.Context, base, key string) ([]DiscoveredModel, string, error) {
	return DiscoverModelsForChannel(ctx, Channel{BaseURL: base, APIKey: key, Protocol: "openai"})
}
func DiscoverModelsForChannel(ctx context.Context, ch Channel) ([]DiscoveredModel, string, error) {
	base, key := ch.BaseURL, ch.APIKey
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	if base == "" {
		return nil, "", fmt.Errorf("empty base url")
	}
	candidates := []string{base + "/models"}
	if !strings.HasSuffix(base, "/v1") {
		candidates = append(candidates, base+"/v1/models")
	}
	if strings.HasSuffix(base, "/v1") {
		root := strings.TrimSuffix(base, "/v1")
		candidates = append(candidates, root+"/models")
	}
	seen := map[string]bool{}
	client := &http.Client{Timeout: 8 * time.Second}
	for _, u := range candidates {
		if seen[u] {
			continue
		}
		seen[u] = true
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			continue
		}
		req.Header.Set("Accept", "application/json")
		switch ch.Protocol {
		case "anthropic":
			req.Header.Set("anthropic-version", "2023-06-01")
			if key != "" {
				req.Header.Set("x-api-key", key)
			}
		case "gemini":
			if key != "" {
				req.Header.Set("x-goog-api-key", key)
			}
		default:
			if key != "" {
				req.Header.Set("Authorization", "Bearer "+key)
			}
		}
		ApplyChannelHeaders(req, ch)
		res, err := client.Do(req)
		if err != nil {
			continue
		}
		b, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
		res.Body.Close()
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			continue
		}
		var payload struct {
			Data []struct {
				ID               string   `json:"id"`
				Name             string   `json:"name"`
				ContextLength    int      `json:"context_length"`
				InputModalities  []string `json:"input_modalities"`
				OutputModalities []string `json:"output_modalities"`
			} `json:"data"`
			Models []struct {
				ID               string   `json:"id"`
				Name             string   `json:"name"`
				ContextLength    int      `json:"context_length"`
				InputModalities  []string `json:"input_modalities"`
				OutputModalities []string `json:"output_modalities"`
			} `json:"models"`
		}
		if json.Unmarshal(b, &payload) != nil {
			continue
		}
		rows := payload.Data
		if len(rows) == 0 {
			rows = payload.Models
		}
		var out []DiscoveredModel
		used := map[string]bool{}
		for _, m := range rows {
			id := m.ID
			if id == "" {
				id = m.Name
			}
			if ch.Protocol == "gemini" {
				id = strings.TrimPrefix(id, "models/")
			}
			if id == "" || used[id] {
				continue
			}
			used[id] = true
			out = append(out, DiscoveredModel{ID: id, Context: m.ContextLength, InputModalities: m.InputModalities, OutputModalities: m.OutputModalities})
		}
		if len(out) > 0 {
			return out, u, nil
		}
	}
	return nil, "", fmt.Errorf("provider exposes no model list")
}
