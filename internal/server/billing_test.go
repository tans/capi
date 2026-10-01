package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/protocol"
	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/store"
)

func billingFixture(t *testing.T) (*Server, APIKey, *http.Cookie) {
	t.Helper()
	st, err := store.Open(t.TempDir() + "/test.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, seed := range []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('owner','owner@example.test','Owner','unused','admin',?)`, []any{now}},
		{`INSERT INTO workspaces(id,name,kind,created_at) VALUES('workspace','Workspace','team',?)`, []any{now}},
		{`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES('workspace','owner','owner',?)`, []any{now}},
		{`INSERT INTO wallets(workspace_id,balance_micros,currency,updated_at) VALUES('workspace',100,'USD',?)`, []any{now}},
		{`INSERT INTO api_keys(id,workspace_id,name,key_hash,key_prefix,secret,scopes,created_at) VALUES('key','workspace','Key',?,'prefix','test-secret','*',?)`, []any{auth.HashToken("test-secret"), now}},
	} {
		if _, err := st.DB.Exec(seed.query, seed.args...); err != nil {
			t.Fatal(err)
		}
	}
	cfg := config.Load()
	cfg.DataDir = t.TempDir()
	cfg.FilesDir = cfg.DataDir + "/files"
	s := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	token, _, err := auth.CreateSession(context.Background(), st, "owner")
	if err != nil {
		t.Fatal(err)
	}
	return s, APIKey{ID: "key", WorkspaceID: "workspace", Name: "Key", Scopes: "*"}, &http.Cookie{Name: "capi_session", Value: token}
}

func TestBillingReservationsSerializeBudgetAndBalance(t *testing.T) {
	for _, budget := range []bool{false, true} {
		t.Run(map[bool]string{true: "key", false: "wallet"}[budget], func(t *testing.T) {
			s, k, _ := billingFixture(t)
			if budget {
				if _, err := s.Store.DB.Exec(`UPDATE wallets SET balance_micros=1000`); err != nil {
					t.Fatal(err)
				}
				if _, err := s.Store.DB.Exec(`UPDATE api_keys SET budget_limit_micros=100`); err != nil {
					t.Fatal(err)
				}
			}
			var successful atomic.Int32
			var wg sync.WaitGroup
			for i := 0; i < 8; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					err := s.reserveBilling(context.Background(), auth.RandomID("reserve_"), k, 70)
					if err == nil {
						successful.Add(1)
					} else if !errors.Is(err, errQuota) {
						t.Error(err)
					}
				}()
			}
			wg.Wait()
			if successful.Load() != 1 {
				t.Fatal("oversubscribed", successful.Load())
			}
			var held int64
			if err := s.Store.DB.QueryRow(`SELECT reserved_micros FROM wallets WHERE workspace_id='workspace'`).Scan(&held); err != nil || held != 70 {
				t.Fatal(held, err)
			}
			var id string
			s.Store.DB.QueryRow(`SELECT id FROM billing_reservations WHERE state='held'`).Scan(&id)
			for i := 0; i < 2; i++ {
				if err := s.releaseReservation(context.Background(), id); err != nil {
					t.Fatal(err)
				}
			}
			s.Store.DB.QueryRow(`SELECT reserved_micros FROM wallets WHERE workspace_id='workspace'`).Scan(&held)
			if held != 0 {
				t.Fatal("release not idempotent", held)
			}
		})
	}
}

func TestGroupRatioAppliesToReservationAndFinalSettlement(t *testing.T) {
	s, key, _ := billingFixture(t)
	ch := provider.Channel{ID: "platform", InputMicrosPerMillion: 1_000_000, OutputMicrosPerMillion: 1_000_000}
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"max_tokens":10}`))
	if _, err := s.Store.DB.Exec(`UPDATE model_groups SET ratio=2 WHERE name='default'`); err != nil {
		t.Fatal(err)
	}
	withBilling, err := s.beginBilling(request, key, ch, []byte(`{"max_tokens":10}`), "model")
	if err != nil {
		t.Fatal(err)
	}
	attempt := billingState(withBilling)
	if attempt.Ratio != 2 || attempt.Reserved < 20 {
		t.Fatalf("reservation did not include ratio: %#v", attempt)
	}
	if err := s.recordUsageDetailed(withBilling, key, ch, "model", "model", "model", "/v1/chat/completions", 200, protocol.Usage{Input: 10}, 0, 0, ""); err != nil {
		t.Fatal(err)
	}
	var balance, charged int64
	if err := s.Store.DB.QueryRow(`SELECT balance_micros FROM wallets WHERE workspace_id='workspace'`).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if err := s.Store.DB.QueryRow(`SELECT cost_micros FROM usage_records ORDER BY created_at DESC LIMIT 1`).Scan(&charged); err != nil {
		t.Fatal(err)
	}
	if balance != 80 || charged != 20 {
		t.Fatalf("ratio settlement mismatch: balance=%d charge=%d", balance, charged)
	}
	if _, err := s.Store.DB.Exec(`UPDATE model_groups SET ratio=0 WHERE name='default'`); err != nil {
		t.Fatal(err)
	}
	freeRequest, err := s.beginBilling(request, key, ch, []byte(`{"max_tokens":10}`), "model")
	if err != nil {
		t.Fatal(err)
	}
	if attempt := billingState(freeRequest); attempt.Ratio != 0 || attempt.Reserved != 0 {
		t.Fatalf("zero-ratio group should not reserve credit: %#v", attempt)
	}
	if err := s.recordUsageDetailed(freeRequest, key, ch, "model", "model", "model", "/v1/chat/completions", 200, protocol.Usage{Input: 10}, 0, 0, ""); err != nil {
		t.Fatal(err)
	}
	if err := s.Store.DB.QueryRow(`SELECT balance_micros FROM wallets WHERE workspace_id='workspace'`).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if balance != 80 {
		t.Fatalf("zero-ratio usage debited wallet: %d", balance)
	}
}

func TestConfiguredPricingControlsTokenCallAndVideoSettlement(t *testing.T) {
	s, key, _ := billingFixture(t)
	if _, err := s.Store.DB.Exec(`UPDATE wallets SET balance_micros=1000 WHERE workspace_id='workspace'`); err != nil {
		t.Fatal(err)
	}
	pricing := emptyPricing()
	pricing.InputPrice["model"] = 2_000_000
	pricing.OutputPrice["model"] = 10_000_000
	pricing.CacheInputPrice["model"] = 1_000_000
	pricing.ModelPrice["call-model"] = 5
	pricing.VideoPricePerSecond["clip"] = 2
	encoded, err := json.Marshal(pricing)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Store.DB.Exec(`UPDATE app_settings SET config_json=? WHERE id=1`, string(encoded)); err != nil {
		t.Fatal(err)
	}
	ch := provider.Channel{ID: "platform", InputMicrosPerMillion: 1_000_000, OutputMicrosPerMillion: 1_000_000}
	tokenReq := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"model","max_tokens":10}`))
	withBilling, err := s.beginBilling(tokenReq, key, ch, []byte(`{"model":"model","max_tokens":10}`), "model")
	if err != nil {
		t.Fatal(err)
	}
	pricing.InputPrice["model"] = 200_000_000
	changed, _ := json.Marshal(pricing)
	if _, err := s.Store.DB.Exec(`UPDATE app_settings SET config_json=? WHERE id=1`, string(changed)); err != nil {
		t.Fatal(err)
	}
	if err := s.recordUsageDetailed(withBilling, key, ch, "model", "model", "model", "/v1/chat/completions", 200, protocol.Usage{Input: 100, Output: 10, CacheRead: 50}, 0, 0, ""); err != nil {
		t.Fatal(err)
	}
	pricing.InputPrice["model"] = 2_000_000
	encoded, _ = json.Marshal(pricing)
	if _, err := s.Store.DB.Exec(`UPDATE app_settings SET config_json=? WHERE id=1`, string(encoded)); err != nil {
		t.Fatal(err)
	}
	callReq := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"call-model"}`))
	callBilling, err := s.beginBilling(callReq, key, ch, []byte(`{"model":"call-model"}`), "call-model")
	if err != nil {
		t.Fatal(err)
	}
	if billingState(callBilling).PriceMode != "call" {
		t.Fatalf("per-call mode not selected: %#v", billingState(callBilling))
	}
	if err := s.recordUsageDetailed(callBilling, key, ch, "call-model", "call-model", "call-model", "/v1/chat/completions", 200, protocol.Usage{}, 0, 0, ""); err != nil {
		t.Fatal(err)
	}
	videoReq := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(`{"model":"clip","seconds":"3"}`))
	videoBilling, err := s.beginBilling(videoReq, key, ch, []byte(`{"model":"clip","seconds":"3"}`), "clip")
	if err != nil {
		t.Fatal(err)
	}
	if billingState(videoBilling).PriceMode != "video" || billingState(videoBilling).Reserved != 6 {
		t.Fatalf("video reservation: %#v", billingState(videoBilling))
	}
	if err := s.recordUsageDetailed(videoBilling, key, ch, "clip", "clip", "clip", "/v1/videos", 202, protocol.Usage{}, 0, 0, ""); err != nil {
		t.Fatal(err)
	}
	var balance int64
	if err := s.Store.DB.QueryRow(`SELECT balance_micros FROM wallets WHERE workspace_id='workspace'`).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if balance != 739 {
		t.Fatalf("configured prices settled incorrectly, remaining balance=%d", balance)
	}
	var tokenCost, callCost, videoCost int64
	if err := s.Store.DB.QueryRow(`SELECT cost_micros FROM usage_records WHERE model='model'`).Scan(&tokenCost); err != nil {
		t.Fatal(err)
	}
	if err := s.Store.DB.QueryRow(`SELECT cost_micros FROM usage_records WHERE model='call-model'`).Scan(&callCost); err != nil {
		t.Fatal(err)
	}
	if err := s.Store.DB.QueryRow(`SELECT cost_micros FROM usage_records WHERE model='clip'`).Scan(&videoCost); err != nil {
		t.Fatal(err)
	}
	if tokenCost != 250 || callCost != 5 || videoCost != 6 {
		t.Fatalf("costs token/call/video = %d/%d/%d", tokenCost, callCost, videoCost)
	}
}

func TestBillingSettlementAtomicIdempotentAndCancellationSafe(t *testing.T) {
	s, k, _ := billingFixture(t)
	ch := provider.Channel{ID: "platform", InputMicrosPerMillion: 1_000_000, OutputMicrosPerMillion: 1_000_000}
	if err := s.reserveBilling(context.Background(), "first", k, 70); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := httptest.NewRequest("POST", "/", nil).WithContext(context.WithValue(ctx, billingContextKey{}, billingAttempt{ID: "first", Reserved: 70}))
	for i := 0; i < 2; i++ {
		if err := s.recordUsageDetailed(r, k, ch, "model", "model", "model", "/v1/chat/completions", 200, protocol.Usage{Input: 20, Output: 10}, 0, 0, ""); err != nil {
			t.Fatal(err)
		}
	}
	var balance, held, cost, delta int64
	var uses, entries int
	s.Store.DB.QueryRow(`SELECT balance_micros,reserved_micros FROM wallets`).Scan(&balance, &held)
	s.Store.DB.QueryRow(`SELECT COUNT(*),SUM(cost_micros) FROM usage_records`).Scan(&uses, &cost)
	s.Store.DB.QueryRow(`SELECT COUNT(*),SUM(delta_micros) FROM wallet_entries`).Scan(&entries, &delta)
	if balance != 70 || held != 0 || uses != 1 || cost != 30 || entries != 1 || delta != -30 {
		t.Fatal(balance, held, uses, cost, entries, delta)
	}
	if err := s.reserveBilling(context.Background(), "rollback", k, 50); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Store.DB.Exec(`CREATE TRIGGER fail_usage BEFORE INSERT ON usage_records BEGIN SELECT RAISE(ABORT,'injected'); END`); err != nil {
		t.Fatal(err)
	}
	r = httptest.NewRequest("POST", "/", nil).WithContext(context.WithValue(context.Background(), billingContextKey{}, billingAttempt{ID: "rollback", Reserved: 50}))
	if err := s.recordUsageDetailed(r, k, ch, "m", "m", "m", "/v1/chat/completions", 200, protocol.Usage{Input: 10}, 0, 0, ""); err == nil {
		t.Fatal("ignored recording failure")
	}
	var state string
	s.Store.DB.QueryRow(`SELECT state FROM billing_reservations WHERE id='rollback'`).Scan(&state)
	s.Store.DB.QueryRow(`SELECT balance_micros,reserved_micros FROM wallets`).Scan(&balance, &held)
	if balance != 70 || held != 0 || state != "unknown" {
		t.Fatal("partial debit after rollback", balance, held, state)
	}
	if _, err := tokenCost(provider.Channel{InputMicrosPerMillion: math.MaxInt64}, math.MaxInt64, 0); err == nil {
		t.Fatal("price multiplication overflow accepted")
	}
}

func TestGatewayBillingFallbackAndQuota(t *testing.T) {
	s, k, _ := billingFixture(t)
	var calls atomic.Int32
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("Authorization") == "Bearer failing" {
			w.WriteHeader(500)
			return
		}
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		if body["stream"] == true {
			w.Header().Set("Content-Type", "text/event-stream")
			io.WriteString(w, "data: {\"model\":\"model\",\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":2},\"choices\":[]}\n\ndata: [DONE]\n\n")
			return
		}
		io.WriteString(w, `{"model":"model","usage":{"prompt_tokens":10,"completion_tokens":2},"choices":[]}`)
	}))
	defer up.Close()
	for _, ch := range []provider.Channel{
		{ID: "fail", Name: "Fail", APIKey: "failing", BaseURL: up.URL, Protocol: "openai", Models: []string{"model"}, Enabled: true, Weight: 1, Priority: 10, InputMicrosPerMillion: 1_000_000, OutputMicrosPerMillion: 1_000_000},
		{ID: "success", Name: "Success", APIKey: "working", BaseURL: up.URL, Protocol: "openai", Models: []string{"model"}, Enabled: true, Weight: 1, InputMicrosPerMillion: 1_000_000, OutputMicrosPerMillion: 1_000_000},
	} {
		if err := provider.Create(context.Background(), s.Store, ch); err != nil {
			t.Fatal(err)
		}
	}
	call := func(stream ...bool) (int, string) {
		body := `{"model":"model","messages":[],"max_tokens":2}`
		if len(stream) > 0 && stream[0] {
			body = `{"model":"model","messages":[],"max_tokens":2,"stream":true}`
		}
		req := httptest.NewRequest("POST", "/v1/chat/completions", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer test-secret")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, req)
		return w.Code, w.Body.String()
	}
	status, body := call()
	if status != 200 {
		t.Fatal(status, body)
	}
	var balance, held int64
	s.Store.DB.QueryRow(`SELECT balance_micros,reserved_micros FROM wallets`).Scan(&balance, &held)
	if balance != 88 || held != 0 || calls.Load() != 2 {
		t.Fatal(balance, held, calls.Load())
	}
	status, body = call(true)
	if status != 200 || !strings.Contains(body, "[DONE]") {
		t.Fatal(status, body)
	}
	s.Store.DB.QueryRow(`SELECT balance_micros,reserved_micros FROM wallets`).Scan(&balance, &held)
	if balance != 76 || held != 0 {
		t.Fatal("stream not settled", balance, held)
	}
	if _, err := s.Store.DB.Exec(`UPDATE wallets SET balance_micros=0`); err != nil {
		t.Fatal(err)
	}
	status, body = call()
	if status != 429 || !strings.Contains(body, "quota_exceeded") || calls.Load() != 3 {
		t.Fatal("unfunded call reached upstream", status, body, calls.Load())
	}
	wid := k.WorkspaceID
	if err := provider.Create(context.Background(), s.Store, provider.Channel{ID: "byok", WorkspaceID: &wid, Name: "BYOK", BaseURL: up.URL, Protocol: "openai", Models: []string{"model"}, Enabled: true, Weight: 1, InputMicrosPerMillion: 1_000_000, OutputMicrosPerMillion: 1_000_000}); err != nil {
		t.Fatal(err)
	}
	status, body = call()
	if status != 200 {
		t.Fatal("BYOK fallback blocked", status, body)
	}
	var charged int64
	s.Store.DB.QueryRow(`SELECT cost_micros FROM usage_records ORDER BY created_at DESC LIMIT 1`).Scan(&charged)
	if charged != 0 {
		t.Fatal("BYOK charged", charged)
	}
}

func TestStreamSettlementFailureDoesNotSendCompletion(t *testing.T) {
	for _, client := range []struct{ path, body, done string }{
		{"/v1/chat/completions", `{"model":"model","messages":[],"max_tokens":2,"stream":true}`, "[DONE]"},
		{"/v1/messages", `{"model":"model","messages":[],"max_tokens":2,"stream":true}`, "message_stop"},
	} {
		t.Run(client.path, func(t *testing.T) {
			s, _, _ := billingFixture(t)
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
				io.WriteString(w, "data: {\"model\":\"model\",\"usage\":{\"prompt_tokens\":120,\"completion_tokens\":2},\"choices\":[]}\n\ndata: [DONE]\n\n")
			}))
			defer up.Close()
			if err := provider.Create(context.Background(), s.Store, provider.Channel{ID: "paid", Name: "Paid", BaseURL: up.URL, Protocol: "openai", Models: []string{"model"}, Enabled: true, Weight: 1, InputMicrosPerMillion: 1_000_000, OutputMicrosPerMillion: 1_000_000}); err != nil {
				t.Fatal(err)
			}
			req := httptest.NewRequest("POST", client.path, strings.NewReader(client.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			s.Handler().ServeHTTP(w, req)
			if w.Code != 200 || !strings.Contains(w.Body.String(), "billing_settlement_failed") || strings.Contains(w.Body.String(), client.done) {
				t.Fatal("incorrect stream completion", w.Code, w.Body.String())
			}
			var balance, held int64
			var state string
			s.Store.DB.QueryRow(`SELECT balance_micros,reserved_micros FROM wallets`).Scan(&balance, &held)
			s.Store.DB.QueryRow(`SELECT state FROM billing_reservations`).Scan(&state)
			if balance != 100 || held != 0 || state != "unknown" {
				t.Fatal(balance, held, state)
			}
		})
	}
}

func TestExpiredBillingLeaseIsVisibleAndDoesNotLockFunds(t *testing.T) {
	s, k, _ := billingFixture(t)
	if err := s.reserveBilling(context.Background(), "crashed", k, 70); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := s.Store.ExpireBillingLeases(context.Background(), time.Now().Add(24*time.Hour)); err != nil {
			t.Fatal(err)
		}
	}
	var balance, reserved int64
	var state string
	s.Store.DB.QueryRow(`SELECT balance_micros,reserved_micros FROM wallets`).Scan(&balance, &reserved)
	s.Store.DB.QueryRow(`SELECT state FROM billing_reservations WHERE id='crashed'`).Scan(&state)
	if balance != 100 || reserved != 0 || state != "unknown" {
		t.Fatal(balance, reserved, state)
	}
}

func TestActualCostCannotExceedWalletOrKeyBudget(t *testing.T) {
	for _, budget := range []bool{false, true} {
		t.Run(map[bool]string{false: "wallet", true: "key"}[budget], func(t *testing.T) {
			s, k, _ := billingFixture(t)
			cost := int64(120)
			if budget {
				if _, err := s.Store.DB.Exec(`UPDATE api_keys SET budget_limit_micros=50`); err != nil {
					t.Fatal(err)
				}
				cost = 60
			}
			if err := s.reserveBilling(context.Background(), "actual", k, 40); err != nil {
				t.Fatal(err)
			}
			r := httptest.NewRequest("POST", "/", nil).WithContext(context.WithValue(context.Background(), billingContextKey{}, billingAttempt{ID: "actual", Reserved: 40}))
			err := s.recordUsageDetailed(r, k, provider.Channel{ID: "paid", InputMicrosPerMillion: 1_000_000}, "m", "m", "m", "/v1/chat/completions", 200, protocol.Usage{Input: cost}, 0, 0, "")
			if !errors.Is(err, errQuota) {
				t.Fatal(err)
			}
			var balance, reserved int64
			var uses, entries int
			s.Store.DB.QueryRow(`SELECT balance_micros,reserved_micros FROM wallets`).Scan(&balance, &reserved)
			s.Store.DB.QueryRow(`SELECT COUNT(*) FROM usage_records`).Scan(&uses)
			s.Store.DB.QueryRow(`SELECT COUNT(*) FROM wallet_entries`).Scan(&entries)
			if balance != 100 || reserved != 0 || uses != 0 || entries != 0 {
				t.Fatal(balance, reserved, uses, entries)
			}
		})
	}
}

func TestBillingConsoleCreditRedemptionAndPermissions(t *testing.T) {
	s, _, cookie := billingFixture(t)
	call := func(method, path string, body any, session bool) (int, map[string]any) {
		t.Helper()
		data, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		if session {
			req.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, req)
		var out map[string]any
		json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}
	if status, _ := call("GET", "/api/workspaces/workspace/billing", nil, false); status != 401 {
		t.Fatal(status)
	}
	if status, _ := call("GET", "/api/workspaces/other/billing", nil, true); status != 403 {
		t.Fatal(status)
	}
	if status, _ := call("POST", "/api/admin/workspaces/workspace/credit", map[string]any{"micros": 50}, true); status != 200 {
		t.Fatal(status)
	}
	if status, _ := call("POST", "/api/admin/workspaces/workspace/credit", map[string]any{"micros": -50}, true); status != 400 {
		t.Fatal(status)
	}
	status, created := call("POST", "/api/admin/redeem-codes", map[string]any{"amount": "0.000020"}, true)
	if status != 201 {
		t.Fatal(status, created)
	}
	code := created["code"].(string)
	for i := 0; i < 2; i++ {
		status, out := call("POST", "/api/user/redeem", map[string]any{"workspaceId": "workspace", "code": code}, true)
		if status != 200 || out["replayed"] != (i == 1) {
			t.Fatal(status, out)
		}
	}
	status, bill := call("GET", "/api/workspaces/workspace/billing", nil, true)
	if status != 200 || bill["balance_micros"] != float64(170) || bill["total"] != float64(2) {
		t.Fatal("double redemption or lost ledger", status, bill)
	}
	if status, _ := call("GET", "/api/workspaces/workspace/billing?page=bad", nil, true); status != 400 {
		t.Fatal(status)
	}
	status, codes := call("GET", "/api/admin/redeem-codes", nil, true)
	if status != 200 || codes["data"].([]any)[0].(map[string]any)["status"] != "redeemed" {
		t.Fatal(status, codes)
	}
	status, created = call("POST", "/api/admin/redeem-codes", map[string]any{"amount": "0.000010"}, true)
	if status != 201 {
		t.Fatal(status, created)
	}
	id := created["id"].(string)
	code = created["code"].(string)
	if status, _ := call("PATCH", "/api/admin/redeem-codes", map[string]any{"id": id, "enabled": false}, true); status != 200 {
		t.Fatal(status)
	}
	if status, _ := call("POST", "/api/user/redeem", map[string]any{"workspaceId": "workspace", "code": code}, true); status != 400 {
		t.Fatal("disabled redeemed", status)
	}
	if _, err := s.Store.DB.Exec(`UPDATE users SET role='user';UPDATE workspace_members SET role='member'`); err != nil {
		t.Fatal(err)
	}
	if status, _ := call("POST", "/api/admin/redeem-codes", map[string]any{"amount": 1}, true); status != 403 {
		t.Fatal("non-admin issued code", status)
	}
	if status, _ := call("POST", "/api/user/redeem", map[string]any{"workspaceId": "workspace", "code": code}, true); status != 403 {
		t.Fatal("member credited wallet", status)
	}
}
