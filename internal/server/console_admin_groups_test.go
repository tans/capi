package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/store"
)

func TestAdminGroupsCRUDProtectionAndReferenceCleanup(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir = dir
	cfg.FilesDir = dir + "/files"
	cfg.AdminEmail = "group-admin@example.test"
	server := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	srv := httptest.NewServer(server.Handler())
	defer srv.Close()
	request := func(method, path string, input any, cookie *http.Cookie, origin string) (*http.Response, map[string]any) {
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
		if origin != "" {
			req.Header.Set("Origin", origin)
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
	register := func(email string) *http.Cookie {
		res, _ := request("POST", "/api/auth/register", map[string]string{"name": "Group tester", "email": email, "password": "group-password-123"}, nil, "")
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("register %s: %d", email, res.StatusCode)
		}
		return res.Cookies()[0]
	}
	admin, member := register("group-admin@example.test"), register("group-member@example.test")
	if res, _ := request("GET", "/api/admin/groups", nil, member, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("non-admin list: %d", res.StatusCode)
	}
	res, listing := request("GET", "/api/admin/groups", nil, admin, "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("list defaults: %d %#v", res.StatusCode, listing)
	}
	foundDefault := false
	for _, row := range listing["data"].([]any) {
		item := row.(map[string]any)
		if item["name"] == "default" && item["ratio"] == float64(1) && item["createdAt"].(float64) > 0 {
			foundDefault = true
		}
	}
	if !foundDefault {
		t.Fatalf("default group missing or malformed: %#v", listing)
	}
	group := map[string]any{"name": "VIP tier", "displayName": "VIP", "ratio": 2.0, "description": "Priority members", "status": 1}
	if res, _ := request("POST", "/api/admin/groups", group, admin, "https://attacker.test"); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("cross-origin request should reach group validation: %d", res.StatusCode)
	}
	if res, _ := request("POST", "/api/admin/groups", map[string]any{"name": "bad name", "displayName": "Bad", "ratio": 1, "status": 1}, admin, ""); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid name: %d", res.StatusCode)
	}
	group["name"] = "vip"
	res, created := request("POST", "/api/admin/groups", group, admin, "")
	if res.StatusCode != http.StatusCreated || created["id"] != "vip" {
		t.Fatalf("create group: %d %#v", res.StatusCode, created)
	}
	if res, _ := request("POST", "/api/admin/groups", group, admin, ""); res.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate group: %d", res.StatusCode)
	}
	if _, err := st.DB.Exec(`INSERT INTO workspaces(id,name,created_at) VALUES('ws_group','Group workspace',?)`, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO api_keys(id,workspace_id,name,key_hash,key_prefix,secret,scopes,created_at,group_name) VALUES('group-key','ws_group','Group key',?,'prefix','secret','*',?,'vip')`, auth.HashToken("secret"), time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO channels(id,name,protocol,base_url,api_key,models_json,created_at,updated_at,config_json) VALUES('group-channel','Group channel','openai','https://upstream.test','secret','["model"]',?,?,?)`, time.Now().UTC().Format(time.RFC3339Nano), time.Now().UTC().Format(time.RFC3339Nano), `{"groups":["default","vip"]}`); err != nil {
		t.Fatal(err)
	}
	if res, _ := request("GET", "/api/admin/channels", nil, member, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("non-admin channel listing: %d", res.StatusCode)
	}
	res, channels := request("GET", "/api/admin/channels", nil, admin, "")
	encodedChannels, _ := json.Marshal(channels)
	if res.StatusCode != http.StatusOK || bytes.Contains(encodedChannels, []byte(`"secret"`)) {
		t.Fatalf("safe admin channel listing: %d %s", res.StatusCode, encodedChannels)
	}
	adminChannel := map[string]any{"name": "Admin managed", "type": "openai-compatible", "baseUrl": "https://upstream.test/v1", "keys": []string{"managed-secret"}, "models": []string{"admin-model"}, "groups": []string{"default"}, "priority": 4, "weight": 2, "status": 1}
	if res, _ := request("POST", "/api/admin/channels", map[string]any{"name": ""}, admin, "https://attacker.test"); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("cross-origin request should reach channel validation: %d", res.StatusCode)
	}
	if res, _ := request("POST", "/api/admin/channels", adminChannel, member, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("non-admin channel create: %d", res.StatusCode)
	}
	res, createdChannel := request("POST", "/api/admin/channels", adminChannel, admin, "")
	if res.StatusCode != http.StatusCreated || createdChannel["id"] == nil {
		t.Fatalf("admin channel create: %d %#v", res.StatusCode, createdChannel)
	}
	channelID := createdChannel["id"].(string)
	if res, _ := request("PATCH", "/api/admin/channels/"+channelID, map[string]any{"status": 3}, admin, ""); res.StatusCode != http.StatusOK {
		t.Fatalf("admin channel disable: %d", res.StatusCode)
	}
	res, channels = request("GET", "/api/admin/channels", nil, admin, "")
	foundDisabled := false
	for _, raw := range channels["data"].([]any) {
		item := raw.(map[string]any)
		if item["id"] == channelID && item["enabled"] == false {
			foundDisabled = true
		}
	}
	if res.StatusCode != http.StatusOK || !foundDisabled {
		t.Fatalf("admin channel state did not persist: %d %#v", res.StatusCode, channels)
	}
	if res, _ := request("DELETE", "/api/admin/channels/"+channelID, nil, admin, ""); res.StatusCode != http.StatusOK {
		t.Fatalf("admin channel delete: %d", res.StatusCode)
	}
	res, route := request("GET", "/api/admin/abilities?group=vip&model=model", nil, admin, "")
	if res.StatusCode != http.StatusOK || route["group"] != "vip" || route["model"] != "model" || len(route["layers"].([]any)) != 1 {
		t.Fatalf("route inspection: %d %#v", res.StatusCode, route)
	}
	if res, _ := request("PATCH", "/api/admin/groups/vip", map[string]any{"name": "renamed", "ratio": 3.0, "status": 2}, admin, ""); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("rename group: %d", res.StatusCode)
	}
	if res, _ := request("PATCH", "/api/admin/groups/vip", map[string]any{"ratio": 3.0, "status": 2}, admin, ""); res.StatusCode != http.StatusOK {
		t.Fatalf("disable group: %d", res.StatusCode)
	}
	if _, err := server.keyGroupRatio(context.Background(), "group-key"); err == nil {
		t.Fatal("disabled group remained usable")
	}
	if res, _ := request("PATCH", "/api/admin/groups/vip", map[string]any{"status": 1}, admin, ""); res.StatusCode != http.StatusOK {
		t.Fatalf("enable group: %d", res.StatusCode)
	}
	ratio, err := server.keyGroupRatio(context.Background(), "group-key")
	if err != nil || ratio != 3 {
		t.Fatalf("group ratio: %v %v", ratio, err)
	}
	if res, _ := request("DELETE", "/api/admin/groups/default", nil, admin, ""); res.StatusCode != http.StatusConflict {
		t.Fatalf("delete default: %d", res.StatusCode)
	}
	if res, _ := request("DELETE", "/api/admin/groups/vip", nil, admin, ""); res.StatusCode != http.StatusOK {
		t.Fatalf("delete group: %d", res.StatusCode)
	}
	var keyGroup, configJSON string
	if err := st.DB.QueryRow(`SELECT group_name FROM api_keys WHERE id='group-key'`).Scan(&keyGroup); err != nil {
		t.Fatal(err)
	}
	if err := st.DB.QueryRow(`SELECT config_json FROM channels WHERE id='group-channel'`).Scan(&configJSON); err != nil {
		t.Fatal(err)
	}
	decoded, err := provider.DecodeChannelConfig(configJSON)
	if err != nil || keyGroup != "default" || len(decoded.Groups) != 1 || decoded.Groups[0] != "default" {
		t.Fatalf("deleted references: key=%s cfg=%#v err=%v", keyGroup, decoded.Groups, err)
	}
	if res, _ := request("GET", "/api/admin/groups", nil, admin, ""); res.StatusCode != http.StatusOK {
		t.Fatalf("list after delete: %d", res.StatusCode)
	}
}
