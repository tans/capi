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

func TestConsoleAccountPasswordChangeKeepsCurrentSessionAndRevokesOthers(t *testing.T) {
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

	post := func(path string, input any, cookie *http.Cookie) (*http.Response, map[string]any) {
		t.Helper()
		body, _ := json.Marshal(input)
		req, _ := http.NewRequest(http.MethodPost, srv.URL+path, bytes.NewReader(body))
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
		return res, out
	}
	res, _ := post("/api/auth/register", map[string]string{"name": "Account Tester", "email": "account@example.test", "password": "original-password-1"}, nil)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("register: %d", res.StatusCode)
	}
	current := res.Cookies()[0]
	res.Body.Close()
	res, _ = post("/api/auth/login", map[string]string{"email": "account@example.test", "password": "original-password-1"}, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("second login: %d", res.StatusCode)
	}
	otherSession := res.Cookies()[0]
	res.Body.Close()

	request := func(method, path string, body any, cookie *http.Cookie, origin string) (int, map[string]any) {
		t.Helper()
		var input io.Reader
		if body != nil {
			raw, _ := json.Marshal(body)
			input = bytes.NewReader(raw)
		}
		req, _ := http.NewRequest(method, srv.URL+path, input)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		response, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		out := map[string]any{}
		_ = json.NewDecoder(response.Body).Decode(&out)
		return response.StatusCode, out
	}
	if status, _ := request(http.MethodGet, "/api/user/account", nil, nil, ""); status != http.StatusUnauthorized {
		t.Fatalf("anonymous account read: %d", status)
	}
	if status, result := request(http.MethodGet, "/api/user/account", nil, current, ""); status != http.StatusOK || result["email"] != "account@example.test" || result["createdAt"] == nil {
		t.Fatalf("account data: %d %#v", status, result)
	}
	change := map[string]string{"currentPassword": "original-password-1", "newPassword": "replacement-password-2"}
	if status, _ := request(http.MethodPut, "/api/user/password", change, current, "https://attacker.example"); status != http.StatusForbidden {
		t.Fatalf("cross-origin change: %d", status)
	}
	if status, result := request(http.MethodPut, "/api/user/password", map[string]string{"currentPassword": "incorrect", "newPassword": "replacement-password-2"}, current, ""); status != http.StatusUnauthorized || result["error"].(map[string]any)["code"] != "invalid_current_password" {
		t.Fatalf("wrong current password: %d %#v", status, result)
	}
	if status, _ := request(http.MethodPut, "/api/user/password", map[string]string{"currentPassword": "original-password-1", "newPassword": "short"}, current, ""); status != http.StatusBadRequest {
		t.Fatalf("short new password: %d", status)
	}
	if status, _ := request(http.MethodPut, "/api/user/password", change, current, ""); status != http.StatusOK {
		t.Fatalf("change password: %d", status)
	}
	if status, _ := request(http.MethodGet, "/api/auth/me", nil, current, ""); status != http.StatusOK {
		t.Fatalf("current session was revoked: %d", status)
	}
	if status, _ := request(http.MethodGet, "/api/auth/me", nil, otherSession, ""); status != http.StatusUnauthorized {
		t.Fatalf("other session survived password change: %d", status)
	}
	if res, _ := post("/api/auth/login", map[string]string{"email": "account@example.test", "password": "original-password-1"}, nil); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("old password still works: %d", res.StatusCode)
	} else {
		res.Body.Close()
	}
	if res, _ := post("/api/auth/login", map[string]string{"email": "account@example.test", "password": "replacement-password-2"}, nil); res.StatusCode != http.StatusOK {
		t.Fatalf("new password login failed: %d", res.StatusCode)
	} else {
		res.Body.Close()
	}
}
