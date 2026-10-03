package server

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/tans/capi/internal/provider"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestConsoleChannelEditorSettingsExecuteUpstream(t *testing.T) {
	var mu sync.Mutex
	keys := []string{}
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Tenant") != "workspace-test" {
			t.Errorf("custom header not sent: %v", r.Header)
		}
		if r.URL.Path == "/v1/models" {
			writeJSON(w, 200, map[string]any{"data": []map[string]string{{"id": "provider-chat"}}})
			return
		}
		if r.URL.Path == "/v1/systemone" {
			var body map[string]any
			json.NewDecoder(r.Body).Decode(&body)
			q := body["questions"].(map[string]any)["valid"].(map[string]any)
			if q["type"] != "noul" || body["model"] != "provider-eval" {
				t.Errorf("TypeSafe adaptation missing: %v", body)
			}
			writeJSON(w, 200, map[string]any{"model": "provider-eval", "answers": map[string]any{"valid": map[string]any{"type": "noul", "noul": 0.75}}})
			return
		}
		if r.URL.Path == "/paint" {
			var body map[string]any
			json.NewDecoder(r.Body).Decode(&body)
			if body["text"] != "tree" || r.Header.Get("X-Token") != "image-key" {
				t.Errorf("image adapter ignored: %v %v", body, r.Header)
			}
			writeJSON(w, 200, map[string]any{"output": map[string]any{"images": []any{map[string]any{"url": "https://example.test/tree.png"}}}})
			return
		}
		if r.URL.Path != "/v1/chat/completions" {
			http.NotFound(w, r)
			return
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["model"] != "provider-chat" || body["temperature"] != 0.25 {
			t.Errorf("editor settings not executed: %v", body)
		}
		mu.Lock()
		keys = append(keys, r.Header.Get("Authorization"))
		mu.Unlock()
		if body["stream"] == true {
			w.Header().Set("Content-Type", "text/event-stream")
			io.WriteString(w, "data: {\"model\":\"provider-chat\",\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\ndata: [DONE]\n\n")
			return
		}
		writeJSON(w, 200, map[string]any{"model": "provider-chat", "choices": []any{}, "usage": map[string]int{"prompt_tokens": 2, "completion_tokens": 1}})
	}))
	defer up.Close()
	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir = dir
	cfg.FilesDir = dir + "/files"
	s := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()
	var cookie *http.Cookie
	call := func(method, path string, body any, token string) (int, map[string]any, string) {
		t.Helper()
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, ts.URL+path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		} else if cookie != nil {
			req.AddCookie(cookie)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		if path == "/api/auth/register" {
			cookie = res.Cookies()[0]
		}
		b, _ := io.ReadAll(res.Body)
		var out map[string]any
		_ = json.Unmarshal(b, &out)
		return res.StatusCode, out, string(b)
	}
	status, user, _ := call("POST", "/api/auth/register", map[string]string{"name": "Channel Owner", "email": "channel@example.test", "password": "test-password-123"}, "")
	if status != 201 {
		t.Fatal(status, user)
	}
	base := "/api/workspaces/" + user["workspace_id"].(string)
	status, discovery, _ := call("POST", base+"/channels/models", map[string]any{"baseUrl": up.URL + "/v1", "keys": []string{"first"}, "headers": map[string]string{"X-Tenant": "workspace-test"}}, "")
	if status != 200 || discovery["data"].([]any)[0] != "provider-chat" {
		t.Fatal(status, discovery)
	}
	status, ch, _ := call("POST", base+"/channels", map[string]any{"name": "Restored provider", "type": "openai-compatible", "baseUrl": up.URL + "/v1", "keys": []string{"first", "second"}, "multiKeyMode": "polling", "models": []string{"public-chat"}, "groups": []string{"default"}, "modelMapping": map[string]string{"public-chat": "provider-chat"}, "headers": map[string]string{"X-Tenant": "workspace-test"}, "paramOverride": map[string]any{"temperature": 0.25}, "evaluatePath": "/custom-evaluate", "tag": "preserve-tag", "status": 1}, "")
	if status != 201 {
		t.Fatal(status, ch)
	}
	id := ch["id"].(string)
	status, list, raw := call("GET", base+"/channels", nil, "")
	if status != 200 || strings.Contains(raw, `"keys"`) || strings.Contains(raw, `"api_key"`) {
		t.Fatal("credentials leaked", status, raw)
	}
	if list["data"].([]any)[0].(map[string]any)["keyCount"] != float64(2) {
		t.Fatal(list)
	}
	status, key, _ := call("POST", base+"/keys", map[string]any{"name": "Channel key", "scopes": []string{"llm.chat"}}, "")
	if status != 201 {
		t.Fatal(status, key)
	}
	token := key["secret"].(string)
	for _, stream := range []bool{false, true} {
		status, _, raw := call("POST", "/v1/chat/completions", map[string]any{"model": "public-chat", "messages": []map[string]string{{"role": "user", "content": "hello"}}, "stream": stream}, token)
		if status != 200 {
			t.Fatal(status, raw)
		}
	}
	mu.Lock()
	if len(keys) != 2 || keys[0] != "Bearer first" || keys[1] != "Bearer second" {
		t.Fatal("round robin ineffective", keys)
	}
	mu.Unlock()
	status, _, _ = call("PATCH", base+"/channels", map[string]any{"id": id, "name": "Renamed"}, "")
	if status != 200 {
		t.Fatal(status)
	}
	status, list, _ = call("GET", base+"/channels", nil, "")
	projection := list["data"].([]any)[0].(map[string]any)
	if status != 200 || projection["tag"] != "preserve-tag" || projection["evaluatePath"] != "/custom-evaluate" {
		t.Fatal("partial update erased config", projection)
	}
	status, _, _ = call("PATCH", base+"/channels", map[string]any{"id": id, "status": 3}, "")
	if status != 200 {
		t.Fatal(status)
	}
	status, models, _ := call("GET", "/v1/models", nil, token)
	if status != 200 || len(models["data"].([]any)) != 0 {
		t.Fatal("disabled channel still callable", status, models)
	}
	status, _, _ = call("PATCH", base+"/channels", map[string]any{"id": id, "status": 1}, "")
	if status != 200 {
		t.Fatal(status)
	}
	status, _, _ = call("PATCH", base+"/channels", map[string]any{"id": id, "headers": map[string]string{"Host": "other.test"}}, "")
	if status != 400 {
		t.Fatal("unsafe header accepted", status)
	}
	status, evaluation, _ := call("POST", base+"/channels", map[string]any{"name": "Evaluation", "baseUrl": up.URL, "keys": []string{"eval-key"}, "models": []string{"public-eval"}, "modelMapping": map[string]string{"public-eval": "provider-eval"}, "evaluateProtocol": "typesafe", "headers": map[string]string{"X-Tenant": "workspace-test"}}, "")
	if status != 201 {
		t.Fatal(status, evaluation)
	}
	status, key, _ = call("POST", base+"/keys", map[string]any{"name": "Adapters", "scopes": []string{"llm.evaluate", "image.generate"}}, "")
	if status != 201 {
		t.Fatal(status, key)
	}
	adapterToken := key["secret"].(string)
	status, result, raw := call("POST", "/v1/evaluate", map[string]any{"model": "public-eval", "state": "state", "questions": map[string]any{"valid": map[string]string{"type": "boolean"}}}, adapterToken)
	if status != 200 || result["model"] != "public-eval" || !strings.Contains(raw, `"probability":0.75`) {
		t.Fatal(status, raw)
	}
	status, image, _ := call("POST", base+"/channels", map[string]any{"name": "Image", "baseUrl": up.URL, "keys": []string{"image-key"}, "models": []string{"public-image"}, "headers": map[string]string{"X-Tenant": "workspace-test"}, "imageProtocolConfig": json.RawMessage(`{"version":1,"endpoint":"/paint","auth":{"type":"api-key-header","header":"X-Token"},"request":{"text":{"from":"prompt"}},"response":{"imagesPath":"output.images","urlPath":"url"}}`)}, "")
	if status != 201 {
		t.Fatal(status, image)
	}
	status, _, raw = call("POST", "/v1/images/generations", map[string]any{"model": "public-image", "prompt": "tree"}, adapterToken)
	if status != 200 || !strings.Contains(raw, `"url":"https://example.test/tree.png"`) {
		t.Fatal(status, raw)
	}
	for _, automatic := range []bool{true, false} {
		ch := provider.Channel{ID: id, Config: provider.ChannelConfig{AutoBan: &automatic}}
		s.restChannel(context.Background(), ch, "auth_failed", 401, time.Minute)
		var enabled int
		s.Store.DB.QueryRow(`SELECT enabled FROM channels WHERE id=?`, id).Scan(&enabled)
		if automatic && enabled != 0 || !automatic && enabled != 1 {
			t.Fatal("autoBan ignored", automatic, enabled)
		}
		call("PATCH", base+"/channels", map[string]any{"id": id, "status": 1}, "")
	}
	status, _, _ = call("DELETE", base+"/channels?id="+id, nil, "")
	if status != 200 {
		t.Fatal(status)
	}
}
