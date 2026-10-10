package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestAdminOverviewUsesLiveRelayAndUsageData(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir, cfg.FilesDir, cfg.AdminEmail = dir, dir+"/files", "overview-admin@example.test"
	cfg.RelayTimeout = 45 * time.Second
	srv := httptest.NewServer(New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler())
	defer srv.Close()
	register := func(name, email string) *http.Cookie {
		t.Helper()
		req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/register", strings.NewReader(`{"name":"`+name+`","email":"`+email+`","password":"overview-password-123"}`))
		req.Header.Set("Content-Type", "application/json")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("register %s: %d", email, res.StatusCode)
		}
		return res.Cookies()[0]
	}
	adminCookie := register("Admin", "overview-admin@example.test")
	memberCookie := register("Member", "overview-member@example.test")
	now := time.Now().UTC().Format(time.RFC3339Nano)
	old := time.Now().UTC().Add(-48 * time.Hour).Format(time.RFC3339Nano)
	if _, err := st.DB.Exec(`INSERT INTO channels(id,name,protocol,base_url,api_key,models_json,enabled,weight,created_at,updated_at,config_json) VALUES('overview-active','Active','openai','https://upstream.test','secret','["model-a","model-b"]',1,1,?,?,?)`, now, now, `{"groups":["default"]}`); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO channels(id,name,protocol,base_url,api_key,models_json,enabled,weight,created_at,updated_at,config_json,last_error,auto_disabled_at) VALUES('overview-disabled','Disabled','openai','https://upstream.test','secret','["model-c"]',0,1,?,?,?,'invalid key',?)`, now, now, `{"groups":["default"]}`, now); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO usage_records(id,workspace_id,api_key_id,channel_id,model,endpoint,cost_micros,status,created_at) VALUES('overview-usage-new','ws-overview','key-overview','overview-active','model-a','chat',250000,200,?),('overview-usage-old','ws-overview','key-overview','overview-active','model-a','chat',1000000,200,?)`, now, old); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`UPDATE app_settings SET config_json=? WHERE id=1`, `{"currency":{"code":"EUR","symbol":"€","rate":2}}`); err != nil {
		t.Fatal(err)
	}
	adminReq, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/admin/overview", nil)
	adminReq.AddCookie(adminCookie)
	response, err := http.DefaultClient.Do(adminReq)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("admin overview: %d", response.StatusCode)
	}
	var overview struct {
		Channels struct {
			Total        int `json:"total"`
			Enabled      int `json:"enabled"`
			AutoDisabled int `json:"autoDisabled"`
		} `json:"channels"`
		Groups map[string]int `json:"groups"`
		Usage  struct {
			TotalRequests int64   `json:"total_requests"`
			Recent        int64   `json:"requests_24h"`
			Amount        float64 `json:"amount_24h"`
			Currency      string  `json:"currency"`
		} `json:"usage"`
		Settings struct {
			Timeout int64              `json:"requestTimeoutMs"`
			Ratios  map[string]float64 `json:"groupRatio"`
		} `json:"settings"`
	}
	if err := json.NewDecoder(response.Body).Decode(&overview); err != nil {
		t.Fatal(err)
	}
	if overview.Channels.Total != 2 || overview.Channels.Enabled != 1 || overview.Channels.AutoDisabled != 1 || overview.Groups["default"] != 2 || overview.Usage.TotalRequests != 2 || overview.Usage.Recent != 1 || overview.Usage.Amount != 0.25 || overview.Usage.Currency != "EUR" || overview.Settings.Timeout != 45000 || overview.Settings.Ratios["default"] != 1 {
		t.Fatalf("unexpected live overview: %#v", overview)
	}
	memberReq, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/admin/overview", nil)
	memberReq.AddCookie(memberCookie)
	memberRes, err := http.DefaultClient.Do(memberReq)
	if err != nil {
		t.Fatal(err)
	}
	defer memberRes.Body.Close()
	if memberRes.StatusCode != http.StatusForbidden {
		t.Fatalf("non-admin overview: %d", memberRes.StatusCode)
	}
}
