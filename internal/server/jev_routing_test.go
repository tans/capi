package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestAutomaticRoutingUsesWorkspaceProfile(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["model"] != "route-model" {
			t.Fatalf("upstream received model %v", body["model"])
		}
		writeJSON(w, http.StatusOK, map[string]any{"model": "route-model", "choices": []any{}, "usage": map[string]int{"prompt_tokens": 1, "completion_tokens": 1}})
	}))
	defer upstream.Close()

	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir, cfg.FilesDir = dir, dir+"/files"
	srv := httptest.NewServer(New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler())
	defer srv.Close()

	call := func(method, path string, body any, cookie *http.Cookie, token string) (*http.Response, map[string]any) {
		t.Helper()
		encoded, _ := json.Marshal(body)
		req, err := http.NewRequest(method, srv.URL+path, bytes.NewReader(encoded))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			req.AddCookie(cookie)
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var result map[string]any
		_ = json.NewDecoder(res.Body).Decode(&result)
		return res, result
	}
	res, registered := call(http.MethodPost, "/api/auth/register", map[string]string{"name": "Route owner", "email": "route-owner@example.test", "password": "route-password-123"}, nil, "")
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("register: %d %#v", res.StatusCode, registered)
	}
	cookie := res.Cookies()[0]
	wid := registered["workspace_id"].(string)
	base := "/api/workspaces/" + wid
	res, _ = call(http.MethodPost, base+"/channels", map[string]any{"name": "Route channel", "baseUrl": upstream.URL + "/v1", "keys": []string{"upstream-key"}, "models": []string{"route-model"}, "groups": []string{"default"}}, cookie, "")
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("channel: %d", res.StatusCode)
	}
	res, key := call(http.MethodPost, base+"/keys", map[string]any{"name": "Route key", "scopes": []string{"llm.chat"}}, cookie, "")
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("key: %d %#v", res.StatusCode, key)
	}
	routeConfig := map[string]any{
		"alias":    "capi-smart",
		"profiles": map[string]any{"chat": map[string]string{"light": "route-model"}},
		"fallback": map[string]string{"intent": "other", "complexity": "standard"},
	}
	res, _ = call(http.MethodPatch, base, map[string]any{"routeConfig": routeConfig, "jevAutoRoutingEnabled": true}, cookie, "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("route settings: %d", res.StatusCode)
	}
	res, _ = call(http.MethodPost, "/v1/chat/completions", map[string]any{"model": "capi-smart", "messages": []map[string]string{{"role": "user", "content": "write a short reply"}}}, nil, key["secret"].(string))
	if res.StatusCode != http.StatusOK {
		t.Fatalf("routed request: %d", res.StatusCode)
	}
	res, _ = call(http.MethodPost, "/v1/chat/completions", map[string]any{"model": "capi-auto", "messages": []map[string]string{{"role": "user", "content": "write a short reply"}}}, nil, key["secret"].(string))
	if res.StatusCode != http.StatusOK {
		t.Fatalf("default alias request: %d", res.StatusCode)
	}
}
