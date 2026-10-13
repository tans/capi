package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestConsolePromptsPaginationAndMemberScoping(t *testing.T) {
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
	call := func(method, path string, cookie *http.Cookie) (int, map[string]any) {
		t.Helper()
		req, _ := http.NewRequest(method, ts.URL+path, nil)
		if cookie != nil {
			req.AddCookie(cookie)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		out := map[string]any{}
		_ = json.NewDecoder(res.Body).Decode(&out)
		return res.StatusCode, out
	}
	register := func(email string) (*http.Cookie, string) {
		t.Helper()
		raw, _ := json.Marshal(map[string]string{"email": email, "password": "test-password-123", "name": "Tester"})
		res, err := http.Post(ts.URL+"/api/auth/register", "application/json", bytes.NewReader(raw))
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var out struct {
			Workspace string `json:"workspace_id"`
		}
		_ = json.NewDecoder(res.Body).Decode(&out)
		if res.StatusCode != 201 {
			t.Fatal(res.StatusCode)
		}
		return res.Cookies()[0], out.Workspace
	}
	owner, wid := register("owner@example.test")
	other, _ := register("other@example.test")
	base := "/api/workspaces/" + wid
	if status, _ := call("GET", base+"/prompts", nil); status != 401 {
		t.Fatal("anonymous prompts allowed", status)
	}
	memberRequest := httptest.NewRequest("GET", "/", nil)
	memberRequest.AddCookie(other)
	memberSession, err := s.requireSession(memberRequest)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?)`, wid, memberSession.User.ID, "member", time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	keyID, keyName := auth.RandomID("key_"), "Owner key"
	_, err = st.DB.Exec(`INSERT INTO api_keys(id,workspace_id,name,key_hash,key_prefix,secret,scopes,enabled,created_at,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?)`, keyID, wid, keyName, auth.RandomID("hash_"), "sk-", "secret", "[]", 1, time.Now().UTC().Format(time.RFC3339Nano), "owner-user")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, part := range []string{"hello owner", "second turn"} {
		if _, err := st.DB.Exec(`INSERT INTO prompt_logs(id,workspace_id,api_key_id,request_id,endpoint,model,prompt_text,sequence,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, auth.RandomID("prompt_"), wid, keyID, "req-1", "/v1/chat/completions", "gpt-5.6", part, 0, now); err != nil {
			t.Fatal(err)
		}
	}
	status, list := call("GET", base+"/prompts", owner)
	if status != 200 {
		t.Fatal(status)
	}
	if list["total"] != float64(1) || list["days"] != float64(30) {
		t.Fatalf("owner totals wrong: total=%v days=%v", list["total"], list["days"])
	}
	row := list["data"].([]any)[0].(map[string]any)
	if row["requestId"] != "req-1" || row["keyName"] != keyName || row["endpoint"] != "/v1/chat/completions" || row["model"] != "gpt-5.6" {
		t.Fatalf("owner projection wrong: %v", row)
	}
	if row["prompt"] != "hello owner\n\nsecond turn" {
		t.Fatalf("prompt parts not joined in order: %q", row["prompt"])
	}
	status, memberList := call("GET", base+"/prompts", other)
	if status != 200 || memberList["total"] != float64(0) {
		t.Fatal("member saw another user's prompts", status, memberList)
	}
	status, _ = call("GET", base+"/prompts?days=0", owner)
	if status != 400 {
		t.Fatal("days out of range accepted", status)
	}
	status, _ = call("GET", base+"/prompts?pageSize=101", owner)
	if status != 400 {
		t.Fatal("pageSize out of range accepted", status)
	}
}
