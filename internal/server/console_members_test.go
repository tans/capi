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

func TestWorkspaceInviteAcceptRolesAndMemberKeyRevocation(t *testing.T) {
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
			raw, _ := json.Marshal(input)
			body = bytes.NewReader(raw)
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
		out := map[string]any{}
		_ = json.NewDecoder(res.Body).Decode(&out)
		return res, out
	}
	register := func(name, email string) *http.Cookie {
		res, _ := request("POST", "/api/auth/register", map[string]string{"name": name, "email": email, "password": "test-password-123"}, nil)
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("register %s: %d", email, res.StatusCode)
		}
		return res.Cookies()[0]
	}
	owner := register("Owner", "owner@example.test")
	invitee := register("Invitee", "invitee@example.test")
	var workspaceID, ownerID, inviteeID string
	if err := st.DB.QueryRow(`SELECT id FROM users WHERE email='owner@example.test'`).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if err := st.DB.QueryRow(`SELECT id FROM users WHERE email='invitee@example.test'`).Scan(&inviteeID); err != nil {
		t.Fatal(err)
	}
	if err := st.DB.QueryRow(`SELECT workspace_id FROM workspace_members WHERE user_id=? AND role='owner'`, ownerID).Scan(&workspaceID); err != nil {
		t.Fatal(err)
	}
	path := "/api/workspaces/" + workspaceID + "/members"
	if res, _ := request("GET", path, nil, nil); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous list: %d", res.StatusCode)
	}
	if res, _ := request("POST", path, map[string]string{"email": "invitee@example.test", "role": "owner"}, owner); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid role: %d", res.StatusCode)
	}
	res, result := request("POST", path, map[string]string{"email": " Invitee@Example.Test ", "role": "member"}, owner)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create invite: %d %#v", res.StatusCode, result)
	}
	token, _ := result["token"].(string)
	if token == "" {
		t.Fatal("invite token missing")
	}
	if res, _ := request("POST", "/api/invites/"+token+"/accept", map[string]any{}, nil); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous accept: %d", res.StatusCode)
	}
	if res, result := request("POST", "/api/invites/"+token+"/accept", map[string]any{}, owner); res.StatusCode != http.StatusForbidden || result["error"].(map[string]any)["code"] != "invite_email_mismatch" {
		t.Fatalf("wrong email: %d %#v", res.StatusCode, result)
	}
	if res, _ := request("GET", "/api/invites/"+token, nil, nil); res.StatusCode != http.StatusOK {
		t.Fatalf("invite detail: %d", res.StatusCode)
	}
	expiredRes, expiredInvite := request("POST", path, map[string]string{"email": "expired@example.test", "role": "member"}, owner)
	if expiredRes.StatusCode != http.StatusCreated {
		t.Fatalf("create expiring invite: %d", expiredRes.StatusCode)
	}
	expiredToken := expiredInvite["token"].(string)
	if _, err := st.DB.Exec(`UPDATE workspace_invites SET expires_at=? WHERE token_hash=?`, time.Now().UTC().Add(-time.Minute).Format(time.RFC3339Nano), auth.HashToken(expiredToken)); err != nil {
		t.Fatal(err)
	}
	if res, _ := request("GET", "/api/invites/"+expiredToken, nil, nil); res.StatusCode != http.StatusGone {
		t.Fatalf("expired invite details: %d", res.StatusCode)
	}
	if res, _ := request("POST", "/api/invites/"+expiredToken+"/accept", map[string]any{}, invitee); res.StatusCode != http.StatusGone {
		t.Fatalf("expired invite acceptance: %d", res.StatusCode)
	}
	if res, _ := request("POST", "/api/invites/"+token+"/accept", map[string]any{}, invitee); res.StatusCode != http.StatusOK {
		t.Fatalf("accept: %d", res.StatusCode)
	}
	if res, _ := request("POST", path, map[string]string{"email": "invitee@example.test", "role": "member"}, owner); res.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate member invite: %d", res.StatusCode)
	}
	if res, _ := request("POST", path, map[string]string{"email": "third@example.test", "role": "member"}, invitee); res.StatusCode != http.StatusForbidden {
		t.Fatalf("member invite permission: %d", res.StatusCode)
	}
	if res, data := request("GET", path, nil, invitee); res.StatusCode != http.StatusOK || len(data["invites"].([]any)) != 0 {
		t.Fatalf("member can see pending invitations: %d %#v", res.StatusCode, data)
	}
	key, secret := "member_key", auth.RandomToken("capi_")
	_, err = st.DB.Exec(`INSERT INTO api_keys(id,workspace_id,name,key_hash,key_prefix,secret,scopes,enabled,created_at,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?)`, key, workspaceID, "Invitee key", auth.HashToken(secret), secret[:18], secret, "llm.chat", 1, time.Now().UTC().Format(time.RFC3339Nano), inviteeID)
	if err != nil {
		t.Fatal(err)
	}
	if res, _ := request("DELETE", path+"/"+inviteeID, nil, owner); res.StatusCode != http.StatusOK {
		t.Fatalf("remove member: %d", res.StatusCode)
	}
	var enabled int
	if err := st.DB.QueryRow(`SELECT enabled FROM api_keys WHERE id=?`, key).Scan(&enabled); err != nil {
		t.Fatal(err)
	}
	if enabled != 0 {
		t.Fatalf("removed member's key still enabled: %d", enabled)
	}
	if res, _ := request("POST", "/api/invites/"+token+"/accept", map[string]any{}, invitee); res.StatusCode != http.StatusNotFound {
		t.Fatalf("consumed invite reused: %d", res.StatusCode)
	}

	// A role change to owner is only available through the explicit transfer operation.
	_, err = st.DB.Exec(`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?)`, workspaceID, inviteeID, "member", time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		t.Fatal(err)
	}
	if res, _ := request("PATCH", path+"/"+inviteeID, map[string]string{"role": "owner"}, owner); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("implicit ownership change: %d", res.StatusCode)
	}
	if res, _ := request("PATCH", path+"/"+inviteeID, map[string]string{"action": "transfer_owner"}, owner); res.StatusCode != http.StatusOK {
		t.Fatalf("transfer ownership: %d", res.StatusCode)
	}
	var newOwnerRole, oldOwnerRole string
	if err := st.DB.QueryRow(`SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, inviteeID).Scan(&newOwnerRole); err != nil {
		t.Fatal(err)
	}
	if err := st.DB.QueryRow(`SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, workspaceID, ownerID).Scan(&oldOwnerRole); err != nil {
		t.Fatal(err)
	}
	if newOwnerRole != "owner" || oldOwnerRole != "admin" {
		t.Fatalf("ownership roles: new=%s old=%s", newOwnerRole, oldOwnerRole)
	}
}
