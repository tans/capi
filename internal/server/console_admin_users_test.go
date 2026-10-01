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

func TestAdminUsersListRoleAndLedgerBackedBalanceUpdates(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir, cfg.FilesDir, cfg.AdminEmail = dir, dir+"/files", "users-admin@example.test"
	srv := httptest.NewServer(New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler())
	defer srv.Close()
	request := func(method, path string, body any, cookie *http.Cookie, origin string) (*http.Response, map[string]any) {
		t.Helper()
		var reader io.Reader
		if body != nil {
			encoded, _ := json.Marshal(body)
			reader = bytes.NewReader(encoded)
		}
		req, _ := http.NewRequest(method, srv.URL+path, reader)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var out map[string]any
		_ = json.NewDecoder(res.Body).Decode(&out)
		return res, out
	}
	register := func(email string) (*http.Cookie, map[string]any) {
		t.Helper()
		res, user := request("POST", "/api/auth/register", map[string]string{"name": "Admin user test", "email": email, "password": "admin-users-password-123"}, nil, "")
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("register %s: %d %#v", email, res.StatusCode, user)
		}
		return res.Cookies()[0], user
	}
	adminCookie, admin := register("users-admin@example.test")
	adminUserID := admin["user"].(map[string]any)["id"].(string)
	memberCookie, member := register("users-member@example.test")
	user := member["user"].(map[string]any)
	userID, workspaceID := user["id"].(string), member["workspace_id"].(string)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := st.DB.Exec(`UPDATE wallets SET balance_micros=20000000,reserved_micros=5000000 WHERE workspace_id=?`, workspaceID); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO api_keys(id,workspace_id,name,key_hash,key_prefix,secret,scopes,created_at,owner_user_id) VALUES('admin-users-key',?,'Usage key',?,'prefix','secret','*',?,?)`, workspaceID, auth.HashToken("admin-users-key-secret"), now, userID); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO usage_records(id,workspace_id,api_key_id,channel_id,model,endpoint,cost_micros,status,created_at) VALUES('admin-users-usage',?,'admin-users-key','channel','model','chat',2500000,200,?)`, workspaceID, now); err != nil {
		t.Fatal(err)
	}
	if res, body := request("GET", "/api/admin/users", nil, memberCookie, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("non-admin user listing: %d %#v", res.StatusCode, body)
	}
	res, listing := request("GET", "/api/admin/users", nil, adminCookie, "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("admin user listing: %d %#v", res.StatusCode, listing)
	}
	found := false
	for _, raw := range listing["data"].([]any) {
		row := raw.(map[string]any)
		if row["id"] == userID {
			found = row["balance"] == float64(20) && row["spent"] == float64(2.5) && row["currency"] == "USD" && row["last_used_at"] != nil
		}
	}
	if !found {
		t.Fatalf("user wallet and usage projection mismatch: %#v", listing)
	}
	path := "/api/admin/users/" + userID
	if res, body := request("PATCH", path, map[string]any{"balance": 40}, adminCookie, "https://attacker.test"); res.StatusCode != http.StatusForbidden {
		t.Fatalf("cross-origin balance update: %d %#v", res.StatusCode, body)
	}
	if res, body := request("PATCH", path, map[string]any{"role": "root"}, adminCookie, ""); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid role: %d %#v", res.StatusCode, body)
	}
	if res, body := request("PATCH", path, map[string]any{"balance": 4}, adminCookie, ""); res.StatusCode != http.StatusConflict {
		t.Fatalf("balance below reservation: %d %#v", res.StatusCode, body)
	}
	if res, body := request("PATCH", "/api/admin/users/"+adminUserID, map[string]any{"role": "user"}, adminCookie, ""); res.StatusCode != http.StatusConflict {
		t.Fatalf("last administrator demotion was not rejected: %d %#v", res.StatusCode, body)
	}
	res, updated := request("PATCH", path, map[string]any{"role": "admin", "balance": 10}, adminCookie, "")
	if res.StatusCode != http.StatusOK || updated["updated"] != true {
		t.Fatalf("admin update: %d %#v", res.StatusCode, updated)
	}
	var balance, reserved, delta, after int64
	if err := st.DB.QueryRow(`SELECT x.balance_micros,x.reserved_micros FROM wallets x WHERE x.workspace_id=?`, workspaceID).Scan(&balance, &reserved); err != nil {
		t.Fatal(err)
	}
	if err := st.DB.QueryRow(`SELECT delta_micros,balance_micros FROM wallet_entries WHERE workspace_id=? AND kind='adjustment' ORDER BY created_at DESC LIMIT 1`, workspaceID).Scan(&delta, &after); err != nil {
		t.Fatal(err)
	}
	if balance != 10_000_000 || reserved != 5_000_000 || delta != -10_000_000 || after != balance {
		t.Fatalf("balance adjustment not recorded atomically: balance=%d reserved=%d delta=%d after=%d", balance, reserved, delta, after)
	}
	if res, body := request("PATCH", path, map[string]any{"role": "user"}, adminCookie, ""); res.StatusCode != http.StatusOK {
		t.Fatalf("demotion while another admin remains: %d %#v", res.StatusCode, body)
	}
}
