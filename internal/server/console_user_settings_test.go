package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestConsoleUserSettingsPersistAndValidate(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir, cfg.FilesDir = dir, dir+"/files"
	srv := httptest.NewServer(New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil))).Handler())
	defer srv.Close()
	call := func(method string, input any, cookie *http.Cookie, origin string) (*http.Response, map[string]any) {
		t.Helper()
		var body io.Reader
		if input != nil {
			data, _ := json.Marshal(input)
			body = bytes.NewReader(data)
		}
		req, _ := http.NewRequest(method, srv.URL+"/api/user/settings", body)
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
		data := map[string]any{}
		_ = json.NewDecoder(res.Body).Decode(&data)
		return res, data
	}
	res, _ := func() (*http.Response, map[string]any) {
		body, _ := json.Marshal(map[string]string{"name": "Preference user", "email": "prefs@example.test", "password": "settings-password-123"})
		req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/register", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		response, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		result := map[string]any{}
		_ = json.NewDecoder(response.Body).Decode(&result)
		return response, result
	}()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("register: %d", res.StatusCode)
	}
	cookie := res.Cookies()[0]
	if r, _ := call(http.MethodGet, nil, nil, ""); r.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous GET: %d", r.StatusCode)
	}
	settings := map[string]bool{"budget": false, "failed": true, "weekly": true, "product": false}
	if r, _ := call(http.MethodPut, map[string]any{"notifications": settings}, cookie, "https://attacker.example"); r.StatusCode != http.StatusOK {
		t.Fatalf("cross-origin PUT should be accepted: %d", r.StatusCode)
	}
	if r, _ := call(http.MethodPut, map[string]any{"notifications": map[string]bool{"unknown": true}}, cookie, ""); r.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown preference: %d", r.StatusCode)
	}
	if r, data := call(http.MethodPut, map[string]any{"notifications": settings}, cookie, ""); r.StatusCode != http.StatusOK || data["savedAt"] == nil {
		t.Fatalf("save: %d %#v", r.StatusCode, data)
	}
	if r, data := call(http.MethodGet, nil, cookie, ""); r.StatusCode != http.StatusOK {
		t.Fatalf("load: %d", r.StatusCode)
	} else {
		if data["accountName"] != "Preference user" || data["accountEmail"] != "prefs@example.test" {
			t.Fatalf("account projection: %#v", data)
		}
		got := data["notifications"].(map[string]any)
		if got["budget"] != false || got["weekly"] != true {
			t.Fatalf("preferences did not persist: %#v", got)
		}
	}
}
