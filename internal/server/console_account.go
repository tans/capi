package server

import (
	"net/http"
	"time"

	"github.com/tans/capi/internal/auth"
)

func (s *Server) consoleAccount(w http.ResponseWriter, r *http.Request) {
	sess, err := s.requireSession(r)
	if err != nil {
		apiError(w, http.StatusUnauthorized, "unauthorized", "Sign in required.")
		return
	}
	var createdAt string
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT created_at FROM users WHERE id=?`, sess.User.ID).Scan(&createdAt); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	parsed, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", "Invalid account creation timestamp.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"name": sess.User.Name, "email": sess.User.Email, "role": sess.User.Role, "createdAt": parsed.UnixMilli()})
}

func (s *Server) consolePassword(w http.ResponseWriter, r *http.Request) {
	if !s.sameOrigin(r) {
		apiError(w, http.StatusForbidden, "bad_origin", "Origin is not allowed.")
		return
	}
	sess, err := s.requireSession(r)
	if err != nil {
		apiError(w, http.StatusUnauthorized, "unauthorized", "Sign in required.")
		return
	}
	var in struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if readJSON(r, &in) != nil || in.CurrentPassword == "" {
		apiError(w, http.StatusBadRequest, "invalid_request", "Current and new passwords are required.")
		return
	}
	if len(in.NewPassword) < 8 {
		apiError(w, http.StatusBadRequest, "invalid_password", "Password must contain at least 8 characters.")
		return
	}

	tx, err := s.Store.DB.BeginTx(r.Context(), nil)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	defer tx.Rollback()
	var currentHash string
	if err := tx.QueryRowContext(r.Context(), `SELECT password_hash FROM users WHERE id=?`, sess.User.ID).Scan(&currentHash); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	if !auth.CheckPassword(currentHash, in.CurrentPassword) {
		apiError(w, http.StatusUnauthorized, "invalid_current_password", "Current password is incorrect.")
		return
	}
	newHash, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		apiError(w, http.StatusBadRequest, "invalid_password", err.Error())
		return
	}
	result, err := tx.ExecContext(r.Context(), `UPDATE users SET password_hash=? WHERE id=? AND password_hash=?`, newHash, sess.User.ID, currentHash)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	updated, err := result.RowsAffected()
	if err != nil || updated != 1 {
		apiError(w, http.StatusConflict, "password_changed", "Password changed in another request. Sign in again.")
		return
	}
	cookie, err := r.Cookie("capi_session")
	if err != nil {
		apiError(w, http.StatusUnauthorized, "unauthorized", "Sign in required.")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `DELETE FROM sessions WHERE user_id=? AND token_hash<>?`, sess.User.ID, auth.HashToken(cookie.Value)); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
