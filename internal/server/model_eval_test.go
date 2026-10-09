package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func evalUpstreamAnswer(prompt string) string {
	switch {
	case strings.Contains(prompt, "17 * 24"):
		return "408"
	case strings.Contains(prompt, "09:15"):
		return "11:55"
	case strings.Contains(prompt, "bloops"):
		return "No. The premises do not guarantee it."
	case strings.Contains(prompt, "alphabet"):
		return "12"
	case strings.Contains(prompt, "exactly these words"):
		return "blue elephant"
	case strings.Contains(prompt, "one per line"):
		return "1\n2\n3\n4\n5"
	case strings.Contains(prompt, "is_palindrome"):
		return "def is_palindrome(s):\n    return s == s[::-1]"
	case strings.Contains(prompt, "kilogram"):
		return "They weigh exactly the same."
	default:
		return "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20"
	}
}

func TestModelEvalRunImportAndHistory(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			http.NotFound(w, r)
			return
		}
		var body struct {
			Stream   bool   `json:"stream"`
			Model    string `json:"model"`
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Messages) == 0 {
			http.Error(w, "bad body", 400)
			return
		}
		answer := evalUpstreamAnswer(body.Messages[len(body.Messages)-1].Content)
		if body.Stream {
			w.Header().Set("Content-Type", "text/event-stream")
			io.WriteString(w, "data: {\"model\":\"test-model\",\"choices\":[{\"delta\":{\"content\":\"\"}}]}\n\n")
			io.WriteString(w, "data: {\"model\":\"test-model\",\"choices\":[{\"delta\":{\"content\":\"" + answer + "\"}}]}\n\n")
			io.WriteString(w, "data: {\"model\":\"test-model\",\"choices\":[{\"delta\":{}}],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":6}}\n\n")
			io.WriteString(w, "data: [DONE]\n\n")
			return
		}
		writeJSON(w, 200, map[string]any{
			"model":     "test-model",
			"choices":   []any{map[string]any{"message": map[string]string{"role": "assistant", "content": answer}}},
			"usage":     map[string]int{"prompt_tokens": 4, "completion_tokens": 6},
		})
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
		var reader io.Reader
		if body != nil {
			raw, _ := json.Marshal(body)
			reader = bytes.NewReader(raw)
		}
		req, _ := http.NewRequest(method, ts.URL+path, reader)
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

	status, user, _ := call("POST", "/api/auth/register", map[string]string{"name": "Eval", "email": "eval@example.test", "password": "test-password-123"}, "")
	if status != 201 {
		t.Fatal(status, user)
	}
	wid := user["workspace_id"].(string)
	base := "/api/workspaces/" + wid

	status, ch, _ := call("POST", base+"/channels", map[string]any{
		"name": "Eval upstream", "type": "openai-compatible", "baseUrl": up.URL + "/v1",
		"keys": []string{"test"}, "models": []string{"test-model"},
	}, "")
	if status != 201 {
		t.Fatal(status, ch)
	}

	// Built-in run: perf (streaming) + intel probes, stored as a capi run.
	status, runOut, raw := call("POST", base+"/model-eval/run", map[string]any{
		"models": []string{"test-model"}, "tasks": []string{"perf", "intel"},
	}, "")
	if status != 200 {
		t.Fatal(status, raw)
	}
	runs := runOut["data"].([]any)
	if len(runs) != 1 {
		t.Fatal(raw)
	}
	run := runs[0].(map[string]any)
	if run["kind"] != "capi" || run["model"] != "test-model" {
		t.Fatal(run)
	}
	if score, _ := run["overall_score"].(float64); score != 1 {
		t.Fatalf("expected all intel tasks to pass, got %v: %s", run["overall_score"], raw)
	}
	metrics := run["metrics"].(map[string]any)
	perf := metrics["perf"].(map[string]any)
	attempts := perf["attempts"].([]any)
	if len(attempts) != 3 {
		t.Fatal(perf)
	}
	attempt := attempts[0].(map[string]any)
	if attempt["ttft_ms"] == nil || attempt["total_ms"] == nil || attempt["output_tokens"] != float64(6) {
		t.Fatal(attempt)
	}

	// History and detail.
	status, listOut, raw := call("GET", base+"/model-eval", nil, "")
	if status != 200 || len(listOut["data"].([]any)) != 1 {
		t.Fatal(status, raw)
	}
	id := listOut["data"].([]any)[0].(map[string]any)["id"].(string)
	status, detailOut, raw := call("GET", base+"/model-eval/"+id, nil, "")
	if status != 200 || detailOut["data"].(map[string]any)["id"] != id {
		t.Fatal(status, raw)
	}

	// Import through a console session.
	status, importOut, raw := call("POST", base+"/model-eval", map[string]any{
		"kind": "bfcl", "model": "test-model", "overall_score": 0.5,
		"metrics": map[string]any{"ast": 0.5, "exec": 0.5},
	}, "")
	if status != 201 || importOut["data"].(map[string]any)["kind"] != "bfcl" {
		t.Fatal(status, raw)
	}

	// Import through a workspace API key (the external runner path).
	status, key, raw := call("POST", base+"/keys", map[string]any{"name": "Eval runner", "scopes": []string{"llm.chat"}}, "")
	if status != 201 {
		t.Fatal(status, raw)
	}
	token := key["secret"].(string)
	status, importOut, raw = call("POST", base+"/model-eval", map[string]any{
		"kind": "lm-eval", "model": "test-model", "metrics": map[string]any{"gsm8k": 0.42},
	}, token)
	if status != 201 || importOut["data"].(map[string]any)["kind"] != "lm-eval" {
		t.Fatal(status, raw)
	}

	// Rejected imports.
	for _, bad := range []map[string]any{
		{"kind": "bad kind!", "model": "m"},
		{"kind": "bfcl"},
		{"kind": "bfcl", "model": "m", "overall_score": 2},
	} {
		status, _, raw = call("POST", base+"/model-eval", bad, "")
		if status != 400 {
			t.Fatal(bad, status, raw)
		}
	}

	// Usage of the built-in run is recorded and attributed to the eval key.
	var usageCount int
	if err := st.DB.QueryRow(`SELECT COUNT(*) FROM usage_records WHERE workspace_id=? AND api_key_id=?`, wid, "ev_"+wid).Scan(&usageCount); err != nil {
		t.Fatal(err)
	}
	if usageCount != 11 { // 3 perf + 8 intel
		t.Fatalf("expected 11 usage records, got %d", usageCount)
	}

	// Delete a run.
	status, _, raw = call("DELETE", base+"/model-eval/"+id, nil, "")
	if status != 200 {
		t.Fatal(status, raw)
	}
	status, listOut, raw = call("GET", base+"/model-eval", nil, "")
	if status != 200 || len(listOut["data"].([]any)) != 2 {
		t.Fatal(status, raw)
	}
}

func TestEvalTaskCheckersFailOnGarbage(t *testing.T) {
	passed := 0
	for _, task := range evalTaskSet {
		ok, _ := task.Check("I refuse to answer and instead sing a poem about clouds.")
		if ok {
			t.Fatalf("checker %s passed on unrelated output", task.ID)
		}
		passed++
	}
	if passed != len(evalTaskSet) {
		t.Fatalf("expected %d failing checks, got %d", len(evalTaskSet), passed)
	}
}
