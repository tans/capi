package server

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
)

const resetCodeTTL = 15 * time.Minute

func (s *Server) forgotPasswordCode(w http.ResponseWriter, r *http.Request) {
	if !s.sameOrigin(r) {
		apiError(w, http.StatusForbidden, "bad_origin", "Origin is not allowed.")
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	if readJSON(r, &in) != nil {
		apiError(w, http.StatusBadRequest, "invalid_request", "Invalid request.")
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if len(email) > 254 {
		writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
		return
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email {
		writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
		return
	}
	now := time.Now().Unix()
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	if ip == "" {
		ip = r.RemoteAddr
	}
	if !s.consumeResetLimit(r, "email:"+email, 5, now) || !s.consumeResetLimit(r, "ip:"+ip, 10, now) {
		writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
		return
	}
	var userID string
	err = s.Store.DB.QueryRowContext(r.Context(), `SELECT id FROM users WHERE email=?`, email).Scan(&userID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
		return
	}
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
		return
	}
	code := fmt.Sprintf("%06d", n.Int64())
	key, err := s.resetHMACKey()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
		return
	}
	hash := resetCodeHash(key, userID, code)
	expires := now + int64(resetCodeTTL.Seconds())
	if _, err := s.Store.DB.ExecContext(r.Context(), `INSERT INTO password_reset_codes(user_id,code_hash,expires_at,created_at,attempts) VALUES(?,?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,created_at=excluded.created_at,attempts=0`, userID, hash, expires, now); err != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
		return
	}
	s.appSettingsMu.Lock()
	settings, err := s.readStoredPricing(r.Context())
	s.appSettingsMu.Unlock()
	if err == nil && settings.EmailSettings.PasswordCiphertext != "" {
		password, decErr := s.decryptSMTPPassword(settings.EmailSettings.PasswordCiphertext)
		if decErr == nil {
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
				defer cancel()
				if err := sendSMTPEmail(ctx, settings.EmailSettings, password, &mail.Address{Address: email}, "CAPI password reset code", "Your CAPI password reset code is "+code+". It expires in 15 minutes. If you did not request this, you can ignore this email."); err != nil {
					s.Log.Warn("password reset email delivery failed", "error", err)
				}
			}()
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
}

// consumeResetLimit stores only a keyed bucket digest and uses an atomic upsert.
func (s *Server) consumeResetLimit(r *http.Request, value string, limit int, now int64) bool {
	digest := auth.HashToken("password-reset:" + value)
	_, err := s.Store.DB.ExecContext(r.Context(), `INSERT INTO password_reset_limits(bucket_hash,window_started_at,request_count) VALUES(?,?,1) ON CONFLICT(bucket_hash) DO UPDATE SET window_started_at=CASE WHEN password_reset_limits.window_started_at<? THEN excluded.window_started_at ELSE password_reset_limits.window_started_at END,request_count=CASE WHEN password_reset_limits.window_started_at<? THEN 1 ELSE password_reset_limits.request_count+1 END`, digest, now, now-3600, now-3600)
	if err != nil {
		return false
	}
	var started int64
	var count int
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT window_started_at,request_count FROM password_reset_limits WHERE bucket_hash=?`, digest).Scan(&started, &count); err != nil {
		return false
	}
	return now-started < 3600 && count <= limit
}

func (s *Server) resetHMACKey() ([]byte, error) {
	if _, err := s.smtpCipher(); err != nil {
		return nil, err
	}
	key, err := os.ReadFile(filepath.Join(s.Cfg.DataDir, smtpKeyFile))
	if err != nil {
		return nil, err
	}
	return key, nil
}

func resetCodeHash(key []byte, userID, code string) string {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte("capi:password-reset:v1:" + userID + ":" + code))
	return fmt.Sprintf("%x", mac.Sum(nil))
}

func (s *Server) forgotPasswordReset(w http.ResponseWriter, r *http.Request) {
	if !s.sameOrigin(r) {
		apiError(w, 403, "bad_origin", "Origin is not allowed.")
		return
	}
	var in struct {
		Email    string `json:"email"`
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	if readJSON(r, &in) != nil {
		apiError(w, 400, "invalid_request", "Invalid request.")
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	invalid := func() { apiError(w, 400, "invalid_reset_code", "The code is invalid or expired.") }
	if len(in.Password) < 8 || len(in.Password) > 1024 {
		apiError(w, 400, "invalid_password", "Password must contain 8 to 1024 bytes.")
		return
	}
	if len(in.Code) != 6 {
		invalid()
		return
	}
	for _, c := range in.Code {
		if c < '0' || c > '9' {
			invalid()
			return
		}
	}
	key, err := s.resetHMACKey()
	if err != nil {
		invalid()
		return
	}
	newHash, err := auth.HashPassword(in.Password)
	if err != nil {
		apiError(w, 400, "invalid_password", err.Error())
		return
	}
	tx, err := s.Store.DB.BeginTx(r.Context(), nil)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer tx.Rollback()
	var userID, stored string
	var expires int64
	var attempts int
	err = tx.QueryRowContext(r.Context(), `SELECT u.id,c.code_hash,c.expires_at,c.attempts FROM users u JOIN password_reset_codes c ON c.user_id=u.id WHERE u.email=?`, email).Scan(&userID, &stored, &expires, &attempts)
	if err != nil || expires < time.Now().Unix() || attempts >= 5 || !hmac.Equal([]byte(stored), []byte(resetCodeHash(key, userID, in.Code))) {
		if err == nil && expires >= time.Now().Unix() && attempts < 5 {
			_ = tx.Rollback()
			_, _ = s.Store.DB.ExecContext(r.Context(), `UPDATE password_reset_codes SET attempts=attempts+1 WHERE user_id=? AND attempts<5`, userID)
		}
		invalid()
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE users SET password_hash=? WHERE id=?`, newHash, userID); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if _, err = tx.ExecContext(r.Context(), `DELETE FROM sessions WHERE user_id=?`, userID); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if _, err = tx.ExecContext(r.Context(), `DELETE FROM password_reset_codes WHERE user_id=?`, userID); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if err = tx.Commit(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "capi_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	writeJSON(w, 200, map[string]bool{"ok": true})
}
