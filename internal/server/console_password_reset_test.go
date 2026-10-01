package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestPasswordResetEnumerationProtectionAndOneTimeSessionRevocation(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir, cfg.FilesDir = dir, dir+"/files"
	s := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()
	call := func(path string, body any, cookie *http.Cookie) (*http.Response, map[string]any) {
		t.Helper()
		b, _ := json.Marshal(body)
		req, _ := http.NewRequest("POST", ts.URL+path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			req.AddCookie(cookie)
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
	register, _ := call("/api/auth/register", map[string]string{"name": "Reset", "email": "reset@example.test", "password": "before-reset-password"}, nil)
	if register.StatusCode != http.StatusCreated {
		t.Fatalf("register: %d", register.StatusCode)
	}
	var cookie *http.Cookie
	for _, c := range register.Cookies() {
		if c.Name == "capi_session" {
			cookie = c
		}
	}
	unknown, _ := call("/api/auth/forgot-password/code", map[string]string{"email": "missing@example.test"}, nil)
	existing, body := call("/api/auth/forgot-password/code", map[string]string{"email": "reset@example.test"}, nil)
	if unknown.StatusCode != existing.StatusCode || body["sent"] != true {
		t.Fatalf("enumeration response differs: %d/%d %#v", unknown.StatusCode, existing.StatusCode, body)
	}
	var storedCode string
	var expiry int64
	if err := st.DB.QueryRow(`SELECT code_hash,expires_at FROM password_reset_codes WHERE user_id=(SELECT id FROM users WHERE email='reset@example.test')`).Scan(&storedCode, &expiry); err != nil {
		t.Fatal(err)
	}
	key, err := os.ReadFile(dir + "/smtp.key")
	if err != nil {
		t.Fatal(err)
	}
	// The handler deliberately generates a random code; exercise redemption with a known
	// code by replacing its keyed digest, while retaining the same production transaction.
	known := "042731"
	digest := resetCodeHash(key, "", known)
	var userID string
	_ = st.DB.QueryRow(`SELECT id FROM users WHERE email='reset@example.test'`).Scan(&userID)
	digest = resetCodeHash(key, userID, known)
	if _, err := st.DB.Exec(`UPDATE password_reset_codes SET code_hash=?,expires_at=? WHERE user_id=?`, digest, time.Now().Unix()+600, userID); err != nil {
		t.Fatal(err)
	}
	reset, resBody := call("/api/auth/forgot-password/reset", map[string]string{"email": "reset@example.test", "code": known, "password": "after-reset-password"}, cookie)
	if reset.StatusCode != 200 || resBody["ok"] != true {
		t.Fatalf("reset: %d %#v", reset.StatusCode, resBody)
	}
	if len(reset.Cookies()) == 0 || reset.Cookies()[0].MaxAge >= 0 {
		t.Fatal("session cookie was not cleared")
	}
	if _, err := st.DB.Exec(`UPDATE password_reset_codes SET code_hash=?,expires_at=? WHERE user_id=?`, digest, time.Now().Unix()+600, userID); err != nil {
		t.Fatal(err)
	}
	replay, _ := call("/api/auth/forgot-password/reset", map[string]string{"email": "reset@example.test", "code": known, "password": "another-password"}, nil)
	if replay.StatusCode != 400 {
		t.Fatalf("code replay accepted: %d", replay.StatusCode)
	}
	meReq, _ := http.NewRequest("GET", ts.URL+"/api/auth/me", nil)
	meReq.AddCookie(cookie)
	me, _ := http.DefaultClient.Do(meReq)
	me.Body.Close()
	if me.StatusCode != 401 {
		t.Fatalf("old session remains valid: %d", me.StatusCode)
	}
	login, _ := call("/api/auth/login", map[string]string{"email": "reset@example.test", "password": "after-reset-password"}, nil)
	if login.StatusCode != 200 {
		t.Fatalf("new password cannot sign in: %d", login.StatusCode)
	}
	if expiry <= time.Now().Unix() || storedCode == "" {
		t.Fatal("reset code was not persisted")
	}
}

func TestPasswordResetCodeFormatAndAttemptLimit(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir + "/db.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir = dir
	s := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	password, _ := auth.HashPassword("long-enough-password")
	_, _ = st.DB.Exec(`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('u','u@example.test','U',?,'user',?)`, password, time.Now().UTC().Format(time.RFC3339Nano))
	key, _ := s.resetHMACKey()
	_, _ = st.DB.Exec(`INSERT INTO password_reset_codes(user_id,code_hash,expires_at,created_at) VALUES('u',?,?,?)`, resetCodeHash(key, "u", "123456"), time.Now().Unix()+600, time.Now().Unix())
	r := httptest.NewRequest("POST", "/api/auth/forgot-password/reset", strings.NewReader(`{"email":"u@example.test","code":"abcdef","password":"new-password-123"}`))
	r.Host = "example.test"
	r.Header.Set("Origin", "http://example.test")
	// Invoke against a local handler to verify malformed codes do not bypass the uniform error.
	w := httptest.NewRecorder()
	s.forgotPasswordReset(w, r)
	if w.Code != 400 || !regexp.MustCompile(`invalid_reset_code`).MatchString(w.Body.String()) {
		t.Fatalf("malformed code response: %d %s", w.Code, w.Body.String())
	}
	for i := 0; i < 5; i++ {
		r = httptest.NewRequest("POST", "/api/auth/forgot-password/reset", strings.NewReader(`{"email":"u@example.test","code":"000000","password":"new-password-123"}`))
		r.Host = "example.test"
		r.Header.Set("Origin", "http://example.test")
		w = httptest.NewRecorder()
		s.forgotPasswordReset(w, r)
		if w.Code != 400 || !strings.Contains(w.Body.String(), "invalid_reset_code") {
			t.Fatalf("wrong code response: %d %s", w.Code, w.Body.String())
		}
	}
	var attempts int
	if err := st.DB.QueryRow(`SELECT attempts FROM password_reset_codes WHERE user_id='u'`).Scan(&attempts); err != nil || attempts != 5 {
		t.Fatalf("attempt counter=%d err=%v", attempts, err)
	}
}
