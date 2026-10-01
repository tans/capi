package server

import (
	"encoding/json"
	"net/http"
	"time"
)

var userNotificationKeys = map[string]bool{
	"budget":  true,
	"failed":  true,
	"weekly":  true,
	"product": true,
}

func (s *Server) consoleUserSettings(w http.ResponseWriter, r *http.Request) {
	sess, err := s.requireSession(r)
	if err != nil {
		apiError(w, http.StatusUnauthorized, "unauthorized", "Sign in required.")
		return
	}
	if r.Method == http.MethodGet {
		var name, email, settings, updatedAt string
		err := s.Store.DB.QueryRowContext(r.Context(), `SELECT u.name,u.email,COALESCE(s.settings_json,'{}'),COALESCE(s.updated_at,'') FROM users u LEFT JOIN user_settings s ON s.user_id=u.id WHERE u.id=?`, sess.User.ID).Scan(&name, &email, &settings, &updatedAt)
		if err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", err.Error())
			return
		}
		var prefs struct {
			Notifications map[string]bool `json:"notifications"`
		}
		if json.Unmarshal([]byte(settings), &prefs) != nil || prefs.Notifications == nil {
			prefs.Notifications = map[string]bool{"budget": true, "failed": true, "weekly": false, "product": false}
		}
		result := map[string]any{"accountName": name, "accountEmail": email, "notifications": prefs.Notifications}
		if updatedAt != "" {
			result["savedAt"] = updatedAt
		}
		writeJSON(w, http.StatusOK, result)
		return
	}
	if !s.sameOrigin(r) {
		apiError(w, http.StatusForbidden, "bad_origin", "Origin is not allowed.")
		return
	}
	var in struct {
		Notifications map[string]bool `json:"notifications"`
	}
	if readJSON(r, &in) != nil || in.Notifications == nil || len(in.Notifications) != len(userNotificationKeys) {
		apiError(w, http.StatusBadRequest, "invalid_settings", "Provide all supported notification preferences.")
		return
	}
	for key := range in.Notifications {
		if !userNotificationKeys[key] {
			apiError(w, http.StatusBadRequest, "invalid_settings", "Unsupported notification preference.")
			return
		}
	}
	payload, err := json.Marshal(struct {
		Notifications map[string]bool `json:"notifications"`
	}{in.Notifications})
	if err != nil {
		apiError(w, http.StatusInternalServerError, "settings_error", "Unable to encode settings.")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := s.Store.DB.ExecContext(r.Context(), `INSERT INTO user_settings(user_id,settings_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET settings_json=excluded.settings_json,updated_at=excluded.updated_at`, sess.User.ID, string(payload), now); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "savedAt": now})
}
