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

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestWorkspaceSettingsUpdateAndPermissions(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir = dir
	cfg.FilesDir = dir + "/files"
	srv := httptest.NewServer(New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler())
	defer srv.Close()
	request := func(method, path string, input any, cookie *http.Cookie) (*http.Response, map[string]any) {
		t.Helper()
		var body io.Reader
		if input != nil {
			data, _ := json.Marshal(input)
			body = bytes.NewReader(data)
		}
		req, _ := http.NewRequest(method, srv.URL+path, body)
		if input != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		result := map[string]any{}
		_ = json.NewDecoder(res.Body).Decode(&result)
		return res, result
	}
	register := func(name, email string) *http.Cookie {
		res, _ := request("POST", "/api/auth/register", map[string]string{"name": name, "email": email, "password": "settings-password-123"}, nil)
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("register %s: %d", email, res.StatusCode)
		}
		return res.Cookies()[0]
	}
	owner := register("Settings owner", "settings-owner@example.test")
	member := register("Settings member", "settings-member@example.test")
	var workspaceID, ownerID, memberID string
	if err := st.DB.QueryRow(`SELECT id FROM users WHERE email='settings-owner@example.test'`).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if err := st.DB.QueryRow(`SELECT id FROM users WHERE email='settings-member@example.test'`).Scan(&memberID); err != nil {
		t.Fatal(err)
	}
	if err := st.DB.QueryRow(`SELECT workspace_id FROM workspace_members WHERE user_id=?`, ownerID).Scan(&workspaceID); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?)`, workspaceID, memberID, "member", time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	path := "/api/workspaces/" + workspaceID
	if res, _ := request("PATCH", path, map[string]any{"name": "Nope"}, member); res.StatusCode != http.StatusForbidden {
		t.Fatalf("member update: %d", res.StatusCode)
	}
	if res, _ := request("PATCH", path, map[string]any{"name": "  "}, owner); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty name: %d", res.StatusCode)
	}
	if res, _ := request("PATCH", path, map[string]any{"name": "Restored workspace", "allowPlatformChannels": false}, owner); res.StatusCode != http.StatusOK {
		t.Fatalf("owner update: %d", res.StatusCode)
	}
	res, data := request("GET", path, nil, owner)
	workspace := data["workspace"].(map[string]any)
	if res.StatusCode != http.StatusOK || workspace["name"] != "Restored workspace" || workspace["allowPlatformChannels"] != false {
		t.Fatalf("updated settings: %d %#v", res.StatusCode, workspace)
	}
	if _, err := st.DB.Exec(`UPDATE workspace_members SET role='admin' WHERE workspace_id=? AND user_id=?`, workspaceID, memberID); err != nil {
		t.Fatal(err)
	}
	if res, _ := request("PATCH", path, map[string]any{"allowPlatformChannels": true}, member); res.StatusCode != http.StatusOK {
		t.Fatalf("admin update: %d", res.StatusCode)
	}
}
