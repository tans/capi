package server

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/mail"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestAdminEmailSettingsEncryptCredentialsAndSendTestMail(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir, cfg.FilesDir, cfg.AdminEmail = dir, dir+"/files", "mail-admin@example.test"
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
		res, _ := request("POST", "/api/auth/register", map[string]string{"name": "Mail user", "email": email, "password": "mail-test-password-123"}, nil, "")
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("register %s: %d", email, res.StatusCode)
		}
		return res.Cookies()[0]
	}
	admin, member := register("mail-admin@example.test"), register("mail-member@example.test")
	if res, _ := request("GET", "/api/admin/email-settings", nil, member, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("member read: %d", res.StatusCode)
	}
	if res, _ := request("POST", "/api/admin/email-settings", map[string]string{"to": "test@example.test"}, admin, "https://attacker.test"); res.StatusCode != http.StatusConflict {
		t.Fatalf("cross-origin request should reach mail configuration validation: %d", res.StatusCode)
	}
	if res, body := request("GET", "/api/admin/email-settings", nil, admin, ""); res.StatusCode != http.StatusOK || body["passwordConfigured"] != false {
		t.Fatalf("initial settings %d %#v", res.StatusCode, body)
	}
	if res, _ := request("PATCH", "/api/admin/email-settings", map[string]any{"smtpHost": "bad host", "smtpPort": 25}, admin, ""); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid host accepted: %d", res.StatusCode)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	mailReceived := make(chan string, 1)
	go serveTestSMTP(listener, mailReceived)
	patch := map[string]any{"smtpHost": "localhost", "smtpPort": port, "security": "none", "smtpUser": "mailer@example.test", "smtpPassword": "very-secret-authorization-code", "fromName": "CAPI Test", "fromAddress": "mailer@example.test"}
	if res, body := request("PATCH", "/api/admin/email-settings", patch, admin, ""); res.StatusCode != http.StatusOK || body["passwordConfigured"] != true {
		t.Fatalf("save settings: %d %#v", res.StatusCode, body)
	}
	if responseStatus, found := func() (int, bool) {
		res, body := request("GET", "/api/admin/email-settings", nil, admin, "")
		_, found := body["smtpPassword"]
		return res.StatusCode, found
	}(); responseStatus != http.StatusOK || found {
		t.Fatalf("password must never be returned by settings API: status=%d found=%v", responseStatus, found)
	}
	var stored string
	if err := st.DB.QueryRow(`SELECT config_json FROM app_settings WHERE id=1`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored, "very-secret-authorization-code") {
		t.Fatal("SMTP password persisted in plaintext")
	}
	keyInfo, err := os.Stat(dir + "/smtp.key")
	if err != nil || keyInfo.Mode().Perm() != 0o600 {
		t.Fatalf("encryption key permissions: %v %v", keyInfo, err)
	}
	if res, body := request("POST", "/api/admin/email-settings", map[string]string{"to": "recipient@example.test"}, admin, ""); res.StatusCode != http.StatusOK || body["success"] != true {
		t.Fatalf("send test email: %d %#v", res.StatusCode, body)
	}
	select {
	case message := <-mailReceived:
		if !strings.Contains(message, "recipient@example.test") || !strings.Contains(message, "CAPI SMTP test") {
			t.Fatalf("unexpected test mail: %q", message)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("SMTP server did not receive the message")
	}
	// Updating ordinary settings must preserve the encrypted SMTP credentials.
	if res, _ := request("PATCH", "/api/admin/settings", map[string]any{"requestTimeoutMs": 5000}, admin, ""); res.StatusCode != http.StatusOK {
		t.Fatalf("save relay settings: %d", res.StatusCode)
	}
	if res, body := request("GET", "/api/admin/email-settings", nil, admin, ""); res.StatusCode != http.StatusOK || body["passwordConfigured"] != true {
		t.Fatalf("SMTP settings lost on relay save: %d %#v", res.StatusCode, body)
	}
	// The encrypted value must survive reading the same SQLite row after server reconstruction.
	restarted := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	value, err := restarted.decryptSMTPPassword(func() string {
		var p storedPricing
		_ = json.Unmarshal([]byte(stored), &p)
		return p.EmailSettings.PasswordCiphertext
	}())
	if err != nil || value != "very-secret-authorization-code" {
		t.Fatalf("decrypt persisted credential: %q %v", value, err)
	}
}

func serveTestSMTP(listener net.Listener, received chan<- string) {
	conn, err := listener.Accept()
	if err != nil {
		return
	}
	defer conn.Close()
	r := bufio.NewReader(conn)
	w := bufio.NewWriter(conn)
	write := func(s string) { _, _ = io.WriteString(w, s+"\r\n"); _ = w.Flush() }
	write("220 localhost ESMTP")
	inData := false
	var message strings.Builder
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")
		if inData {
			if line == "." {
				inData = false
				received <- message.String()
				message.Reset()
				write("250 queued")
			} else {
				message.WriteString(line + "\n")
			}
			continue
		}
		switch {
		case strings.HasPrefix(line, "EHLO ") || strings.HasPrefix(line, "HELO "):
			write("250-localhost")
			write("250 AUTH PLAIN")
		case strings.HasPrefix(line, "AUTH PLAIN "):
			write("235 authenticated")
		case strings.HasPrefix(line, "MAIL FROM:") || strings.HasPrefix(line, "RCPT TO:"):
			write("250 ok")
		case line == "DATA":
			inData = true
			write("354 end with dot")
		case line == "QUIT":
			write("221 bye")
			return
		default:
			write("500 unsupported")
		}
	}
}

func TestSMTPPasswordEncryptionRejectsTampering(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir = dir
	s := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	encoded, err := s.encryptSMTPPassword("test-secret")
	if err != nil {
		t.Fatal(err)
	}
	if value, err := s.decryptSMTPPassword(encoded); err != nil || value != "test-secret" {
		t.Fatalf("round trip: %q %v", value, err)
	}
	if _, err := s.decryptSMTPPassword(encoded + "x"); err == nil {
		t.Fatal("tampered ciphertext was accepted")
	}
	if err := os.Chmod(dir+"/smtp.key", 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.smtpCipher(); err == nil {
		t.Fatal("key with group/world permissions was accepted")
	}
}

func TestSendSMTPTestHonorsCanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := sendSMTPTest(ctx, storedEmailSettings{Host: "localhost", Port: 1, Security: "none", User: "x", FromAddress: "x@example.test"}, "secret", &mail.Address{Address: "y@example.test"})
	if err == nil {
		t.Fatal("canceled SMTP send succeeded")
	}
}
