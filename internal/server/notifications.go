package server

import (
	"context"
	"encoding/json"
	"net/mail"
	"strings"
	"time"
)

func (s *Server) notifyFailedRequest(k APIKey, subject, body string) {
	if k.ID == "" {
		return
	}
	var userID, email string
	if err := s.Store.DB.QueryRow(`SELECT owner_user_id FROM api_keys WHERE id=?`, k.ID).Scan(&userID); err != nil || userID == "" {
		return
	}
	if err := s.Store.DB.QueryRow(`SELECT email FROM users WHERE id=?`, userID).Scan(&email); err != nil {
		return
	}
	var raw string
	if err := s.Store.DB.QueryRow(`SELECT settings_json FROM user_settings WHERE user_id=?`, userID).Scan(&raw); err != nil {
		return
	}
	var settings struct {
		Notifications map[string]bool `json:"notifications"`
	}
	if json.Unmarshal([]byte(raw), &settings) != nil || !settings.Notifications["failed"] {
		return
	}
	s.appSettingsMu.Lock()
	pricing, err := s.readStoredPricing(context.Background())
	s.appSettingsMu.Unlock()
	if err != nil || pricing.EmailSettings.PasswordCiphertext == "" {
		return
	}
	password, err := s.decryptSMTPPassword(pricing.EmailSettings.PasswordCiphertext)
	if err != nil {
		return
	}
	recipient, err := mail.ParseAddress(strings.TrimSpace(email))
	if err != nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := sendSMTPEmail(ctx, pricing.EmailSettings, password, recipient, subject, body); err != nil {
			s.Log.Warn("notification_email_delivery_failed", "error", err)
		}
	}()
}
