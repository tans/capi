package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

func TestDetectReportsEachProtocol(t *testing.T) {
	var mu sync.Mutex
	paths := map[string]bool{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		paths[r.URL.Path] = true
		mu.Unlock()
		if r.URL.Path == "/v1/responses" {
			http.Error(w, `{"error":"unsupported"}`, http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	results := Detect(context.Background(), Channel{APIKey: "secret", Models: []string{"model"}}, srv.URL, "")
	if len(results) != 4 {
		t.Fatalf("got %d detection results", len(results))
	}
	if !results[0].OK || results[0].Status != http.StatusOK || results[0].Millis < 0 {
		t.Fatalf("openai result: %+v", results[0])
	}
	if results[1].OK || results[1].Status != http.StatusNotFound || results[1].Error == "" {
		t.Fatalf("responses result: %+v", results[1])
	}
	mu.Lock()
	defer mu.Unlock()
	for _, path := range []string{"/v1/chat/completions", "/v1/responses", "/v1/messages", "/v1beta/models/model:generateContent"} {
		if !paths[path] {
			t.Errorf("missing probe %s", path)
		}
	}
}

func TestPrepareChannelUsesModelProtocolAndBase(t *testing.T) {
	ch := Channel{Protocol: "openai", BaseURL: "https://default.example/v1", Config: ChannelConfig{
		ProtocolBases:  map[string]string{"anthropic": "https://anthropic.example"},
		ModelProtocols: map[string]string{"claude": "anthropic"},
	}}
	prepared, _, _, err := PrepareChannel(ch, "claude", []byte(`{"model":"claude"}`))
	if err != nil {
		t.Fatal(err)
	}
	if prepared.Protocol != "anthropic" || prepared.BaseURL != "https://anthropic.example" {
		t.Fatalf("prepared channel: %+v", prepared)
	}
	if _, err := json.Marshal(prepared.Config); err != nil {
		t.Fatal(err)
	}
}
