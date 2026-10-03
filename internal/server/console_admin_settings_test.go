package server

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/store"
)

func TestAdminSystemSettingsPersistAndApplyToRuntime(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir, cfg.FilesDir, cfg.AdminEmail, cfg.RelayTimeout = dir, dir+"/files", "settings-admin@example.test", 30*time.Second
	s := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()
	request := func(method, path string, input any, cookie *http.Cookie, origin string) (*http.Response, map[string]any) {
		t.Helper()
		var body io.Reader
		if input != nil {
			encoded, _ := json.Marshal(input)
			body = bytes.NewReader(encoded)
		}
		req, _ := http.NewRequest(method, ts.URL+path, body)
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
		var out map[string]any
		_ = json.NewDecoder(res.Body).Decode(&out)
		return res, out
	}
	register := func(email string) *http.Cookie {
		t.Helper()
		res, _ := request("POST", "/api/auth/register", map[string]string{"name": "Settings user", "email": email, "password": "system-settings-password-123"}, nil, "")
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("register %s: %d", email, res.StatusCode)
		}
		return res.Cookies()[0]
	}
	admin, member := register("settings-admin@example.test"), register("settings-member@example.test")
	if res, body := request("GET", "/api/admin/settings", nil, member, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("non-admin read: %d %#v", res.StatusCode, body)
	}
	res, initial := request("GET", "/api/admin/settings", nil, admin, "")
	if res.StatusCode != http.StatusOK || initial["requestTimeoutMs"] != float64(30000) || initial["autoDisableEnabled"] != true {
		t.Fatalf("settings defaults: %d %#v", res.StatusCode, initial)
	}
	patch := map[string]any{"requestTimeoutMs": 5000, "autoDisableEnabled": false, "pricingCurrency": map[string]any{"code": "cny", "symbol": "¥", "rate": 7.2}}
	if res, body := request("PATCH", "/api/admin/settings", patch, admin, "https://attacker.test"); res.StatusCode != http.StatusForbidden {
		t.Fatalf("cross-origin patch: %d %#v", res.StatusCode, body)
	}
	if res, body := request("PATCH", "/api/admin/settings", map[string]any{"requestTimeoutMs": 600001}, admin, ""); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid timeout: %d %#v", res.StatusCode, body)
	}
	if res, body := request("PATCH", "/api/admin/settings", map[string]any{"pricingCurrency": map[string]any{"code": "US", "symbol": "$", "rate": 1}}, admin, ""); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid currency: %d %#v", res.StatusCode, body)
	}
	res, updated := request("PATCH", "/api/admin/settings", patch, admin, "")
	if res.StatusCode != http.StatusOK || updated["requestTimeoutMs"] != float64(5000) || updated["autoDisableEnabled"] != false {
		t.Fatalf("update settings: %d %#v", res.StatusCode, updated)
	}
	currency := updated["pricingCurrency"].(map[string]any)
	if currency["code"] != "CNY" || currency["symbol"] != "¥" || currency["rate"] != 7.2 || s.relayTimeout(context.Background()) != 5*time.Second || s.runtimeSettings(context.Background()).AutoDisableEnabled {
		t.Fatalf("settings not applied: %#v timeout=%s autoDisable=%v", updated, s.relayTimeout(context.Background()), s.runtimeSettings(context.Background()).AutoDisableEnabled)
	}
	var rawSettings string
	if err := st.DB.QueryRow(`SELECT config_json FROM app_settings WHERE id=1`).Scan(&rawSettings); err != nil {
		t.Fatal(err)
	}
	var liveSettings map[string]any
	if err := json.Unmarshal([]byte(rawSettings), &liveSettings); err != nil {
		t.Fatal(err)
	}
	liveSettings["requestTimeoutMs"], liveSettings["autoDisableEnabled"] = 7000, true
	liveSettingsJSON, err := json.Marshal(liveSettings)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`UPDATE app_settings SET config_json=? WHERE id=1`, string(liveSettingsJSON)); err != nil {
		t.Fatal(err)
	}
	if s.relayTimeout(context.Background()) != 7*time.Second || !s.runtimeSettings(context.Background()).AutoDisableEnabled {
		t.Fatalf("database settings were not loaded in real time: timeout=%s autoDisable=%v", s.relayTimeout(context.Background()), s.runtimeSettings(context.Background()).AutoDisableEnabled)
	}
	liveSettings["requestTimeoutMs"], liveSettings["autoDisableEnabled"] = 5000, false
	liveSettingsJSON, err = json.Marshal(liveSettings)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`UPDATE app_settings SET config_json=? WHERE id=1`, string(liveSettingsJSON)); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := st.DB.Exec(`INSERT INTO channels(id,name,protocol,base_url,api_key,models_json,created_at,updated_at,config_json) VALUES('settings-channel','Settings channel','openai','https://upstream.test','secret','["model"]',?,?,?)`, now, now, `{"groups":["default"]}`); err != nil {
		t.Fatal(err)
	}
	s.restChannel(context.Background(), provider.Channel{ID: "settings-channel", Config: provider.ChannelConfig{}}, "auth", http.StatusUnauthorized, time.Second)
	var enabled int
	var disabledAt sql.NullString
	if err := st.DB.QueryRow(`SELECT enabled,auto_disabled_at FROM channels WHERE id='settings-channel'`).Scan(&enabled, &disabledAt); err != nil {
		t.Fatal(err)
	}
	if enabled != 1 || disabledAt.Valid {
		t.Fatalf("globally disabled auto-disable still disabled a channel: enabled=%d at=%v", enabled, disabledAt)
	}
	if _, body := request("PATCH", "/api/admin/pricing", map[string]any{"inputPrice": map[string]float64{}, "outputPrice": map[string]float64{}, "cacheInputPrice": map[string]float64{}, "modelPrice": map[string]float64{}, "videoPricePerSecond": map[string]float64{}}, admin, ""); body["saved"] != true {
		t.Fatalf("pricing save: %#v", body)
	}
	res, persisted := request("GET", "/api/admin/settings", nil, admin, "")
	if res.StatusCode != http.StatusOK || persisted["requestTimeoutMs"] != float64(5000) || persisted["autoDisableEnabled"] != false || persisted["pricingCurrency"].(map[string]any)["rate"] != 7.2 {
		t.Fatalf("settings lost after price save: %d %#v", res.StatusCode, persisted)
	}
	restarted := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if restarted.relayTimeout(context.Background()) != 5*time.Second || restarted.runtimeSettings(context.Background()).AutoDisableEnabled {
		t.Fatalf("settings not restored on restart: timeout=%s autoDisable=%v", restarted.relayTimeout(context.Background()), restarted.runtimeSettings(context.Background()).AutoDisableEnabled)
	}
}
