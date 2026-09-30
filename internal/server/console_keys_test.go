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

func TestConsoleKeysLifecyclePermissionsAndBudget(t *testing.T) {
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
	call := func(method, path string, body any, cookie *http.Cookie) (int, map[string]any) {
		t.Helper()
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, ts.URL+path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
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
	if status, _ := call("GET", base+"/keys", nil, nil); status != 401 {
		t.Fatal("anonymous list allowed", status)
	}
	if status, _ := call("POST", base+"/keys", map[string]any{"name": "Unauthorized"}, other); status != 403 {
		t.Fatal("cross-workspace mutation allowed", status)
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
	if status, _ := call("POST", base+"/keys", map[string]any{"name": "Forbidden member mutation"}, other); status != 403 {
		t.Fatal("member mutation allowed", status)
	}
	status, key := call("POST", base+"/keys", map[string]any{"name": "Scoped key", "scopes": "llm.chat,billing.read", "budget": "0.000010", "group": "default"}, owner)
	if status != 201 {
		t.Fatalf("create %d %v", status, key)
	}
	id, secret := key["id"].(string), key["secret"].(string)
	authenticate := func(token string) error {
		req := httptest.NewRequest("GET", "/v1/models", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		_, err := s.authenticateAPI(req, "")
		return err
	}
	if authenticate(secret) != nil {
		t.Fatal("new key not usable")
	}
	status, rotated := call("PATCH", base+"/keys", map[string]any{"id": id, "action": "rotate"}, owner)
	if status != 200 || authenticate(secret) == nil || authenticate(rotated["secret"].(string)) != nil {
		t.Fatal("rotation did not invalidate original key", status, rotated)
	}
	status, _ = call("PATCH", base+"/keys", map[string]any{"id": id, "action": "edit", "name": "Updated", "scopes": []string{"billing.read"}, "budget": "0.000020"}, owner)
	if status != 200 {
		t.Fatal("edit failed", status)
	}
	_, err = st.DB.Exec(`INSERT INTO usage_records(id,workspace_id,api_key_id,channel_id,model,endpoint,cost_micros,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, auth.RandomID("use_"), wid, id, "test-channel", "test-model", "/v1/chat/completions", 20, 200, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatal(err)
	}
	if authenticate(rotated["secret"].(string)) == nil {
		t.Fatal("budget exhausted key still usable")
	}
	if _, err := st.DB.Exec(`INSERT INTO usage_records(id,workspace_id,api_key_id,channel_id,model,endpoint,cost_micros,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, auth.RandomID("use_"), wid, id, "test-channel", "test-model", "/v1/chat/completions", 20, 200, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	status, list := call("GET", base+"/keys", nil, owner)
	if status != 200 {
		t.Fatal(status)
	}
	row := list["data"].([]any)[0].(map[string]any)
	if row["name"] != "Updated" || row["budgetSpentQuota"] != float64(20) {
		t.Fatal("key projection incorrect", row)
	}
	status, _ = call("DELETE", base+"/keys?id="+id, nil, owner)
	if status != 200 {
		t.Fatal("revoke failed", status)
	}
	status, _ = call("PATCH", base+"/keys", map[string]any{"id": id, "action": "rotate"}, owner)
	if status != 409 {
		t.Fatal("revoked key rotated", status)
	}
	status, _ = call("POST", base+"/keys", map[string]any{"name": "Bad", "scopes": []string{"not-a-scope"}}, owner)
	if status != 400 {
		t.Fatal("bad scope accepted", status)
	}
	status, _ = call("POST", base+"/keys", map[string]any{"name": "Bad", "budget": "0.0000001"}, owner)
	if status != 400 {
		t.Fatal("fractional micro accepted", status)
	}
	status, usage := call("GET", base+"/usage?pageSize=1", nil, owner)
	if status != 200 || usage["total"] != float64(2) || usage["summary"].(map[string]any)["cost_micros"] != float64(40) || len(usage["data"].([]any)) != 1 {
		t.Fatal("usage totals incorrect", status, usage)
	}
	status, memberKeys := call("GET", base+"/keys", nil, other)
	if status != 200 || len(memberKeys["data"].([]any)) != 0 {
		t.Fatal("member saw another user's keys", status)
	}
	status, memberUsage := call("GET", base+"/usage", nil, other)
	if status != 200 || memberUsage["total"] != float64(0) {
		t.Fatal("member saw another user's usage", status)
	}
	status, _ = call("GET", base+"/usage?days=NaN", nil, owner)
	if status != 400 {
		t.Fatal("invalid filter accepted", status)
	}
	status, newWS := call("POST", "/api/workspaces", map[string]any{"name": "Team"}, owner)
	if status != 201 {
		t.Fatal("create workspace", status, newWS)
	}
	status, detail := call("GET", "/api/workspaces/"+newWS["id"].(string), nil, owner)
	if status != 200 || detail["workspace"].(map[string]any)["role"] != "owner" {
		t.Fatal("workspace ownership missing", status, detail)
	}
}
