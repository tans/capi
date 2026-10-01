package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

// DispatchNotifications sends due persistent notification events. Failed sends
// remain in the outbox and retry with bounded exponential backoff.
func (s *Server) DispatchNotifications(ctx context.Context) {
	rows, err := s.Store.DB.QueryContext(ctx, `SELECT e.id,e.threshold,k.name,u.email,COALESCE(us.settings_json,'{}') FROM notification_events e JOIN api_keys k ON k.id=e.api_key_id JOIN users u ON u.id=k.owner_user_id LEFT JOIN user_settings us ON us.user_id=u.id WHERE e.status='pending' AND e.next_attempt_at<=? ORDER BY e.created_at LIMIT 25`, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		s.Log.Warn("notification_outbox_query_failed", "error", err)
		return
	}
	type event struct {
		id, keyName, email, settings string
		threshold                    int
	}
	var pending []event
	for rows.Next() {
		var item event
		if rows.Scan(&item.id, &item.threshold, &item.keyName, &item.email, &item.settings) == nil {
			pending = append(pending, item)
		}
	}
	rows.Close()
	for _, item := range pending {
		var prefs struct {
			Notifications map[string]bool `json:"notifications"`
		}
		if json.Unmarshal([]byte(item.settings), &prefs) != nil {
			prefs.Notifications = nil
		}
		if prefs.Notifications != nil && !prefs.Notifications["budget"] {
			_, _ = s.Store.DB.ExecContext(ctx, `UPDATE notification_events SET status='suppressed' WHERE id=? AND status='pending'`, item.id)
			continue
		}
		recipient, err := mail.ParseAddress(strings.TrimSpace(item.email))
		if err != nil {
			s.deferNotification(ctx, item.id, err)
			continue
		}
		s.appSettingsMu.Lock()
		pricing, err := s.readStoredPricing(ctx)
		s.appSettingsMu.Unlock()
		if err != nil {
			s.deferNotification(ctx, item.id, err)
			continue
		}
		if pricing.EmailSettings.PasswordCiphertext == "" {
			s.deferNotification(ctx, item.id, errors.New("SMTP is not configured"))
			continue
		}
		password, err := s.decryptSMTPPassword(pricing.EmailSettings.PasswordCiphertext)
		if err == nil {
			sendCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
			err = sendSMTPEmail(sendCtx, pricing.EmailSettings, password, recipient, "CAPI budget threshold reached", fmt.Sprintf("API key %s has reached %d%% of its configured spending cap.", item.keyName, item.threshold))
			cancel()
		}
		if err != nil {
			s.deferNotification(ctx, item.id, err)
			continue
		}
		_, _ = s.Store.DB.ExecContext(ctx, `UPDATE notification_events SET status='delivered',delivered_at=?,last_error='' WHERE id=? AND status='pending'`, time.Now().UTC().Format(time.RFC3339Nano), item.id)
	}
}

func (s *Server) deferNotification(ctx context.Context, id string, cause error) {
	var attempts int
	if err := s.Store.DB.QueryRowContext(ctx, `SELECT attempts FROM notification_events WHERE id=? AND status='pending'`, id).Scan(&attempts); err != nil {
		return
	}
	if attempts < 12 {
		attempts++
	}
	delay := time.Minute << min(attempts, 8)
	_, _ = s.Store.DB.ExecContext(ctx, `UPDATE notification_events SET attempts=?,next_attempt_at=?,last_error=? WHERE id=? AND status='pending'`, attempts, time.Now().UTC().Add(delay).Format(time.RFC3339Nano), cause.Error(), id)
}
