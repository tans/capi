package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/tans/capi/internal/protocol"
	"github.com/tans/capi/internal/provider"
)

func TestBillingSettlementCreatesBudgetThresholdEventsAtomically(t *testing.T) {
	s, key, _ := billingFixture(t)
	if _, err := s.Store.DB.Exec(`UPDATE wallets SET balance_micros=1000 WHERE workspace_id=?`, key.WorkspaceID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Store.DB.Exec(`UPDATE api_keys SET budget_limit_micros=100,owner_user_id='owner' WHERE id=?`, key.ID); err != nil {
		t.Fatal(err)
	}
	settle := func(id string, inputTokens int64) {
		t.Helper()
		request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{}`))
		withBilling := request.WithContext(context.WithValue(request.Context(), billingContextKey{}, billingAttempt{ID: id, Reserved: 100, PriceMode: "tokens", InputRate: 1_000_000}))
		now := time.Now().UTC().Format(time.RFC3339Nano)
		if _, err := s.Store.DB.Exec(`INSERT INTO billing_reservations(id,workspace_id,api_key_id,amount_micros,state,lease_expires_at,created_at,updated_at) VALUES(?,?,?,100,'held',?,?,?)`, id, key.WorkspaceID, key.ID, now, now, now); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Store.DB.Exec(`UPDATE wallets SET reserved_micros=reserved_micros+100 WHERE workspace_id=?`, key.WorkspaceID); err != nil {
			t.Fatal(err)
		}
		if err := s.recordUsageDetailed(withBilling, key, provider.Channel{ID: "paid"}, "model", "model", "model", "/v1/chat/completions", 200, protocol.Usage{Input: inputTokens}, 0, 0, ""); err != nil {
			t.Fatal(err)
		}
	}
	settle("settle_80", 80)
	settle("settle_100", 20)
	var count int
	if err := s.Store.DB.QueryRow(`SELECT COUNT(*) FROM notification_events WHERE api_key_id=? AND kind='budget'`, key.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("notification event count = %d, want 2", count)
	}
}

func TestDispatchNotificationsSuppressesDisabledBudgetPreference(t *testing.T) {
	s, key, _ := billingFixture(t)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := s.Store.DB.Exec(`UPDATE api_keys SET owner_user_id='owner' WHERE id=?`, key.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Store.DB.Exec(`INSERT INTO user_settings(user_id,settings_json,updated_at) VALUES('owner','{"notifications":{"budget":false}}',?)`, now); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Store.DB.Exec(`INSERT INTO notification_events(id,api_key_id,kind,threshold,status,next_attempt_at,created_at) VALUES('event',?,'budget',80,'pending',?,?)`, key.ID, now, now); err != nil {
		t.Fatal(err)
	}
	s.DispatchNotifications(context.Background())
	var status string
	if err := s.Store.DB.QueryRow(`SELECT status FROM notification_events WHERE id='event'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "suppressed" {
		t.Fatalf("notification status = %q, want suppressed", status)
	}
}

func TestDispatchNotificationsRetainsEventsUntilSMTPConfigured(t *testing.T) {
	s, key, _ := billingFixture(t)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := s.Store.DB.Exec(`UPDATE api_keys SET owner_user_id='owner' WHERE id=?`, key.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Store.DB.Exec(`INSERT INTO user_settings(user_id,settings_json,updated_at) VALUES('owner','{"notifications":{"budget":true}}',?)`, now); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Store.DB.Exec(`INSERT INTO notification_events(id,api_key_id,kind,threshold,status,next_attempt_at,created_at) VALUES('event',?,'budget',80,'pending',?,?)`, key.ID, now, now); err != nil {
		t.Fatal(err)
	}
	s.DispatchNotifications(context.Background())
	var status, lastError string
	var attempts int
	if err := s.Store.DB.QueryRow(`SELECT status,attempts,last_error FROM notification_events WHERE id='event'`).Scan(&status, &attempts, &lastError); err != nil {
		t.Fatal(err)
	}
	if status != "pending" || attempts != 1 || lastError == "" {
		t.Fatalf("notification retry state = %q, %d, %q", status, attempts, lastError)
	}
}
