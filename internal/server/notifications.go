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

// QueueWeeklyDigests creates one digest for the most recently completed UTC
// week after Monday 09:00 UTC. The unique period key makes repeated scheduler
// runs and process restarts idempotent.
func (s *Server) QueueWeeklyDigests(ctx context.Context, now time.Time) {
	now = now.UTC()
	weekday := int(now.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	currentMonday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, 1-weekday)
	if now.Before(currentMonday.Add(9 * time.Hour)) {
		return
	}
	periodEnd := currentMonday
	periodStart := periodEnd.AddDate(0, 0, -7)
	start, end := periodStart.Format(time.RFC3339), periodEnd.Format(time.RFC3339)
	created := now.Format(time.RFC3339Nano)
	_, err := s.Store.DB.ExecContext(ctx, `INSERT OR IGNORE INTO weekly_digest_events(id,user_id,period_start,period_end,status,next_attempt_at,created_at)
		SELECT lower(hex(randomblob(16))),u.id,?,?, 'pending',?,?
		FROM users u JOIN user_settings us ON us.user_id=u.id
		WHERE json_valid(us.settings_json) AND json_extract(us.settings_json,'$.notifications.weekly')=1`, start, end, created, created)
	if err != nil {
		s.Log.Warn("weekly_digest_queue_failed", "error", err)
	}
}

// DispatchWeeklyDigests sends due weekly summaries through the configured SMTP
// transport and leaves failures in the outbox for bounded retry.
func (s *Server) DispatchWeeklyDigests(ctx context.Context) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	rows, err := s.Store.DB.QueryContext(ctx, `SELECT e.id,e.user_id,e.period_start,e.period_end,u.email,COALESCE(us.settings_json,'{}')
		FROM weekly_digest_events e JOIN users u ON u.id=e.user_id
		LEFT JOIN user_settings us ON us.user_id=u.id
		WHERE e.status='pending' AND e.next_attempt_at<=? ORDER BY e.created_at LIMIT 25`, now)
	if err != nil {
		s.Log.Warn("weekly_digest_outbox_query_failed", "error", err)
		return
	}
	type digest struct{ id, userID, start, end, email, settings string }
	var pending []digest
	for rows.Next() {
		var item digest
		if rows.Scan(&item.id, &item.userID, &item.start, &item.end, &item.email, &item.settings) == nil {
			pending = append(pending, item)
		}
	}
	rows.Close()
	for _, item := range pending {
		var prefs struct {
			Notifications map[string]bool `json:"notifications"`
		}
		if json.Unmarshal([]byte(item.settings), &prefs) != nil || !prefs.Notifications["weekly"] {
			_, _ = s.Store.DB.ExecContext(ctx, `UPDATE weekly_digest_events SET status='suppressed' WHERE id=? AND status='pending'`, item.id)
			continue
		}
		recipient, err := mail.ParseAddress(strings.TrimSpace(item.email))
		if err != nil {
			s.deferWeeklyDigest(ctx, item.id, err)
			continue
		}
		summary, err := s.weeklyDigestSummary(ctx, item.userID, item.start, item.end)
		if err != nil {
			s.deferWeeklyDigest(ctx, item.id, err)
			continue
		}
		s.appSettingsMu.Lock()
		pricing, err := s.readStoredPricing(ctx)
		s.appSettingsMu.Unlock()
		if err != nil {
			s.deferWeeklyDigest(ctx, item.id, err)
			continue
		}
		if pricing.EmailSettings.PasswordCiphertext == "" {
			s.deferWeeklyDigest(ctx, item.id, errors.New("SMTP is not configured"))
			continue
		}
		password, err := s.decryptSMTPPassword(pricing.EmailSettings.PasswordCiphertext)
		if err == nil {
			body := formatWeeklyDigest(item.start, item.end, summary, pricing.Currency.Code, pricing.Currency.Symbol, pricing.Currency.Rate)
			sendCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
			err = sendSMTPEmail(sendCtx, pricing.EmailSettings, password, recipient, "CAPI weekly usage digest", body)
			cancel()
		}
		if err != nil {
			s.deferWeeklyDigest(ctx, item.id, err)
			continue
		}
		_, _ = s.Store.DB.ExecContext(ctx, `UPDATE weekly_digest_events SET status='delivered',delivered_at=?,last_error='' WHERE id=? AND status='pending'`, time.Now().UTC().Format(time.RFC3339Nano), item.id)
	}
}

type weeklyDigest struct {
	requests int64
	failed   int64
	cost     int64
	models   []struct {
		name     string
		requests int64
		cost     int64
	}
}

func (s *Server) weeklyDigestSummary(ctx context.Context, userID, start, end string) (weeklyDigest, error) {
	var summary weeklyDigest
	err := s.Store.DB.QueryRowContext(ctx, `SELECT COUNT(*),COALESCE(SUM(cost_micros),0),COALESCE(SUM(CASE WHEN status<200 OR status>=400 THEN 1 ELSE 0 END),0)
		FROM usage_records u JOIN api_keys k ON k.id=u.api_key_id WHERE k.owner_user_id=? AND u.created_at>=? AND u.created_at<?`, userID, start, end).Scan(&summary.requests, &summary.cost, &summary.failed)
	if err != nil {
		return summary, err
	}
	rows, err := s.Store.DB.QueryContext(ctx, `SELECT COALESCE(NULLIF(u.routed_model,''),u.model),COUNT(*),COALESCE(SUM(u.cost_micros),0)
		FROM usage_records u JOIN api_keys k ON k.id=u.api_key_id WHERE k.owner_user_id=? AND u.created_at>=? AND u.created_at<?
		GROUP BY COALESCE(NULLIF(u.routed_model,''),u.model) ORDER BY SUM(u.cost_micros) DESC,COUNT(*) DESC LIMIT 5`, userID, start, end)
	if err != nil {
		return summary, err
	}
	defer rows.Close()
	for rows.Next() {
		var model struct {
			name     string
			requests int64
			cost     int64
		}
		if err := rows.Scan(&model.name, &model.requests, &model.cost); err != nil {
			return summary, err
		}
		summary.models = append(summary.models, model)
	}
	return summary, rows.Err()
}

func formatWeeklyDigest(start, end string, summary weeklyDigest, currency, symbol string, rate float64) string {
	startTime, _ := time.Parse(time.RFC3339, start)
	endTime, _ := time.Parse(time.RFC3339, end)
	if symbol == "" {
		symbol = currency + " "
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Usage summary for %s to %s (UTC)\n\n", startTime.Format("2006-01-02"), endTime.AddDate(0, 0, -1).Format("2006-01-02"))
	fmt.Fprintf(&b, "Requests: %d\nFailed requests: %d\nSpend: %s%.2f %s\n\nTop models:\n", summary.requests, summary.failed, symbol, float64(summary.cost)/1_000_000*rate, currency)
	if len(summary.models) == 0 {
		b.WriteString("No model usage recorded.\n")
	}
	for _, model := range summary.models {
		fmt.Fprintf(&b, "- %s: %d requests, %s%.2f %s\n", model.name, model.requests, symbol, float64(model.cost)/1_000_000*rate, currency)
	}
	b.WriteString("\nManage email preferences in CAPI Settings.\n")
	return b.String()
}

func (s *Server) deferWeeklyDigest(ctx context.Context, id string, cause error) {
	var attempts int
	if err := s.Store.DB.QueryRowContext(ctx, `SELECT attempts FROM weekly_digest_events WHERE id=? AND status='pending'`, id).Scan(&attempts); err != nil {
		return
	}
	if attempts < 12 {
		attempts++
	}
	delay := time.Minute << min(attempts, 8)
	_, _ = s.Store.DB.ExecContext(ctx, `UPDATE weekly_digest_events SET attempts=?,next_attempt_at=?,last_error=? WHERE id=? AND status='pending'`, attempts, time.Now().UTC().Add(delay).Format(time.RFC3339Nano), cause.Error(), id)
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
