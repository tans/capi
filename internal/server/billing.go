package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/protocol"
	"github.com/tans/capi/internal/provider"
)

var errQuota = errors.New("insufficient workspace balance or API key budget")

type billingContextKey struct{}
type billingAttempt struct {
	ID             string
	Reserved       int64
	Ratio          float64
	HasRatio       bool
	Model          string
	PriceMode      string
	VideoSeconds   int64
	PriceMicros    int64
	InputRate      int64
	OutputRate     int64
	CacheInputRate int64
}

func tokenCost(ch provider.Channel, input, output int64) (int64, error) {
	if input < 0 || output < 0 || ch.InputMicrosPerMillion < 0 || ch.OutputMicrosPerMillion < 0 {
		return 0, fmt.Errorf("invalid usage or price")
	}
	value := new(big.Int).Mul(big.NewInt(input), big.NewInt(ch.InputMicrosPerMillion))
	value.Add(value, new(big.Int).Mul(big.NewInt(output), big.NewInt(ch.OutputMicrosPerMillion)))
	value.Quo(value, big.NewInt(1_000_000))
	if !value.IsInt64() {
		return 0, fmt.Errorf("usage cost exceeds supported range")
	}
	return value.Int64(), nil
}

func applyGroupRatio(cost int64, ratio float64) (int64, error) {
	if cost < 0 || math.IsNaN(ratio) || math.IsInf(ratio, 0) || ratio < 0 || ratio > 1000 {
		return 0, fmt.Errorf("invalid group ratio")
	}
	rational, ok := new(big.Rat).SetString(strconv.FormatFloat(ratio, 'f', -1, 64))
	if !ok {
		return 0, fmt.Errorf("invalid group ratio")
	}
	value := new(big.Int).Mul(big.NewInt(cost), rational.Num())
	quotient, remainder := new(big.Int).QuoRem(value, rational.Denom(), new(big.Int))
	if new(big.Int).Lsh(remainder, 1).Cmp(rational.Denom()) >= 0 {
		quotient.Add(quotient, big.NewInt(1))
	}
	if !quotient.IsInt64() {
		return 0, fmt.Errorf("usage cost exceeds supported range")
	}
	return quotient.Int64(), nil
}

func (s *Server) keyGroupRatio(ctx context.Context, keyID string) (float64, error) {
	var group string
	if err := s.Store.DB.QueryRowContext(ctx, `SELECT group_name FROM api_keys WHERE id=?`, keyID).Scan(&group); err != nil {
		return 0, err
	}
	if group == "" {
		group = "default"
	}
	var ratio float64
	if err := s.Store.DB.QueryRowContext(ctx, `SELECT ratio FROM model_groups WHERE name=? AND enabled=1`, group).Scan(&ratio); err != nil {
		return 0, fmt.Errorf("model group is unavailable")
	}
	return ratio, nil
}

func (s *Server) beginBilling(r *http.Request, k APIKey, ch provider.Channel, body []byte, billingModel string) (*http.Request, error) {
	ratio, err := s.keyGroupRatio(r.Context(), k.ID)
	if err != nil {
		return nil, err
	}
	pricing, err := s.readStoredPricing(r.Context())
	if err != nil {
		return nil, err
	}
	model, videoSeconds := strings.TrimSpace(billingModel), requestVideoSeconds(body)
	if model == "" {
		model = requestBillingModel(body)
	}
	attempt := billingAttempt{ID: auth.RandomID("bill_"), Ratio: ratio, HasRatio: true, Model: model, VideoSeconds: videoSeconds}
	// Workspace-owned upstream credentials are BYOK and do not debit CAPI credit.
	if ch.WorkspaceID == nil {
		inputPrice, inputPriced := lookupStoredPrice(pricing.InputPrice, model)
		outputPrice, outputPriced := lookupStoredPrice(pricing.OutputPrice, model)
		callPrice, callPriced := lookupStoredPrice(pricing.ModelPrice, model)
		videoPrice, videoPriced := lookupStoredPrice(pricing.VideoPricePerSecond, model)
		isVideo := strings.HasSuffix(strings.TrimRight(r.URL.Path, "/"), "/videos")
		var amount int64
		if callPriced {
			attempt.PriceMode = "call"
			attempt.PriceMicros = callPrice
			amount = callPrice
		} else if isVideo && videoPriced {
			attempt.PriceMode = "video"
			attempt.PriceMicros = videoPrice
			if videoSeconds < 1 {
				videoSeconds = 1
				attempt.VideoSeconds = 1
			}
			value := new(big.Int).Mul(big.NewInt(videoPrice), big.NewInt(videoSeconds))
			if !value.IsInt64() {
				return nil, fmt.Errorf("usage cost exceeds supported range")
			}
			amount = value.Int64()
		} else if inputPriced || outputPriced || ch.InputMicrosPerMillion > 0 || ch.OutputMicrosPerMillion > 0 {
			attempt.PriceMode = "tokens"
			output := int64(512)
			var limits map[string]json.RawMessage
			if json.Unmarshal(body, &limits) == nil {
				for _, key := range []string{"max_tokens", "max_completion_tokens", "max_output_tokens"} {
					if value, ok := limits[key]; ok {
						var n int64
						if json.Unmarshal(value, &n) != nil || n < 1 || n > 10_000_000 {
							return nil, fmt.Errorf("invalid output token limit")
						}
						output = n
						break
					}
				}
			}
			inRate, outRate := ch.InputMicrosPerMillion, ch.OutputMicrosPerMillion
			if inputPriced {
				inRate = inputPrice
			}
			if outputPriced {
				outRate = outputPrice
			}
			attempt.InputRate, attempt.OutputRate = inRate, outRate
			cacheRate, cachePriced := lookupStoredPrice(pricing.CacheInputPrice, model)
			if cachePriced {
				attempt.CacheInputRate = cacheRate
			} else {
				attempt.CacheInputRate = inRate
			}
			amount, err = tokenCost(provider.Channel{InputMicrosPerMillion: inRate, OutputMicrosPerMillion: outRate}, int64((len(body)+3)/4), output)
			if err != nil {
				return nil, err
			}
			if cachePriced {
				if cacheRate < 0 {
					return nil, fmt.Errorf("invalid cache price")
				}
				cachedEstimate, estimateErr := tokenCost(provider.Channel{InputMicrosPerMillion: cacheRate, OutputMicrosPerMillion: outRate}, int64((len(body)+3)/4), output)
				if estimateErr != nil {
					return nil, estimateErr
				}
				if cachedEstimate > amount {
					amount = cachedEstimate
				}
			}
		} else {
			return r.WithContext(context.WithValue(r.Context(), billingContextKey{}, attempt)), nil
		}
		amount, err = applyGroupRatio(amount, ratio)
		if err != nil {
			return nil, err
		}
		if amount == 0 {
			if attempt.PriceMode != "tokens" || ratio == 0 || attempt.InputRate == 0 && attempt.OutputRate == 0 && attempt.CacheInputRate == 0 {
				return r.WithContext(context.WithValue(r.Context(), billingContextKey{}, attempt)), nil
			}
			amount = 1
		}
		if amount < 1 {
			amount = 1
		}
		if err = s.reserveBilling(r.Context(), attempt.ID, k, amount); err != nil {
			return nil, err
		}
		attempt.Reserved = amount
	}
	return r.WithContext(context.WithValue(r.Context(), billingContextKey{}, attempt)), nil
}

func requestBillingModel(body []byte) string {
	var input struct {
		Model string `json:"model"`
	}
	_ = json.Unmarshal(body, &input)
	return strings.TrimSpace(input.Model)
}

func requestVideoSeconds(body []byte) int64 {
	var input map[string]json.RawMessage
	if json.Unmarshal(body, &input) != nil {
		return 1
	}
	for _, key := range []string{"seconds", "duration"} {
		value, ok := input[key]
		if !ok {
			continue
		}
		var n int64
		if json.Unmarshal(value, &n) == nil && n > 0 && n <= 86400 {
			return n
		}
		var text string
		if json.Unmarshal(value, &text) == nil {
			if parsed, err := strconv.ParseInt(text, 10, 64); err == nil && parsed > 0 && parsed <= 86400 {
				return parsed
			}
		}
	}
	return 1
}

func configuredTokenCost(ch provider.Channel, p storedPricing, model string, input, output, cached, cacheWritten int64) (int64, error) {
	if input < 0 || output < 0 || cached < 0 || cacheWritten < 0 {
		return 0, fmt.Errorf("invalid usage or price")
	}
	inRate, inPriced := lookupStoredPrice(p.InputPrice, model)
	outRate, outPriced := lookupStoredPrice(p.OutputPrice, model)
	if !inPriced {
		inRate = ch.InputMicrosPerMillion
	}
	if !outPriced {
		outRate = ch.OutputMicrosPerMillion
	}
	if inRate < 0 || outRate < 0 {
		return 0, fmt.Errorf("invalid usage or price")
	}
	cacheRate, cachePriced := lookupStoredPrice(p.CacheInputPrice, model)
	if !cachePriced {
		cacheRate = inRate
	}
	return tokenCostWithRates(inRate, outRate, cacheRate, input, output, cached, cacheWritten)
}

func tokenCostWithRates(inRate, outRate, cacheRate, input, output, cached, cacheWritten int64) (int64, error) {
	if input < 0 || output < 0 || cached < 0 || cacheWritten < 0 || inRate < 0 || outRate < 0 || cacheRate < 0 {
		return 0, fmt.Errorf("invalid usage or price")
	}
	if cached > input {
		cached = input
	}
	if cacheWritten > input-cached {
		cacheWritten = input - cached
	}
	regular := input - cached - cacheWritten
	value := new(big.Int)
	value.Add(value, new(big.Int).Mul(big.NewInt(regular), big.NewInt(inRate)))
	value.Add(value, new(big.Int).Mul(big.NewInt(cacheWritten), big.NewInt(inRate)))
	value.Add(value, new(big.Int).Mul(big.NewInt(cached), big.NewInt(cacheRate)))
	value.Add(value, new(big.Int).Mul(big.NewInt(output), big.NewInt(outRate)))
	quotient, remainder := new(big.Int).QuoRem(value, big.NewInt(1_000_000), new(big.Int))
	if new(big.Int).Lsh(remainder, 1).Cmp(big.NewInt(1_000_000)) >= 0 {
		quotient.Add(quotient, big.NewInt(1))
	}
	if !quotient.IsInt64() {
		return 0, fmt.Errorf("usage cost exceeds supported range")
	}
	return quotient.Int64(), nil
}

func (s *Server) reserveBilling(ctx context.Context, id string, k APIKey, amount int64) error {
	if amount <= 0 {
		return fmt.Errorf("reservation must be positive")
	}
	tx, err := s.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var balance, reserved, spent, held int64
	var limit sql.NullInt64
	var expires sql.NullString
	var enabled int
	if err = tx.QueryRowContext(ctx, `SELECT balance_micros,reserved_micros FROM wallets WHERE workspace_id=?`, k.WorkspaceID).Scan(&balance, &reserved); err != nil {
		return err
	}
	if err = tx.QueryRowContext(ctx, `SELECT enabled,budget_limit_micros,expires_at,COALESCE((SELECT SUM(cost_micros) FROM usage_records WHERE api_key_id=k.id),0),COALESCE((SELECT SUM(amount_micros) FROM billing_reservations WHERE api_key_id=k.id AND state='held'),0) FROM api_keys k WHERE id=? AND workspace_id=?`, k.ID, k.WorkspaceID).Scan(&enabled, &limit, &expires, &spent, &held); err != nil {
		return err
	}
	if enabled != 1 || expires.Valid && parseTimeMillis(expires.String) <= time.Now().UnixMilli() {
		return fmt.Errorf("API key is unavailable")
	}
	if amount > balance-reserved || limit.Valid && (spent > limit.Int64-held || amount > limit.Int64-spent-held) {
		return errQuota
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err = tx.ExecContext(ctx, `INSERT INTO billing_reservations(id,workspace_id,api_key_id,amount_micros,lease_expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, id, k.WorkspaceID, k.ID, amount, time.Now().UTC().Add(s.relayTimeout()+5*time.Minute).Format(time.RFC3339Nano), now, now); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE wallets SET reserved_micros=reserved_micros+?,updated_at=? WHERE workspace_id=?`, amount, now, k.WorkspaceID); err != nil {
		return err
	}
	return tx.Commit()
}

func billingState(r *http.Request) billingAttempt {
	value, _ := r.Context().Value(billingContextKey{}).(billingAttempt)
	return value
}

func (s *Server) releaseBilling(r *http.Request) {
	attempt := billingState(r)
	if attempt.Reserved == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
	defer cancel()
	if err := s.releaseReservation(ctx, attempt.ID); err != nil {
		s.Log.Error("billing_release_failed", "reservation", attempt.ID, "error", err)
	}
}

func (s *Server) releaseReservation(ctx context.Context, id string) error {
	return s.releaseReservationAs(ctx, id, "released")
}

func (s *Server) releaseReservationAs(ctx context.Context, id, stateAfter string) error {
	tx, err := s.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var wid, state string
	var amount int64
	if err = tx.QueryRowContext(ctx, `SELECT workspace_id,state,amount_micros FROM billing_reservations WHERE id=?`, id).Scan(&wid, &state, &amount); err != nil {
		return err
	}
	if state != "held" {
		return nil
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err = tx.ExecContext(ctx, `UPDATE wallets SET reserved_micros=reserved_micros-?,updated_at=? WHERE workspace_id=? AND reserved_micros>=?`, amount, now, wid, amount); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE billing_reservations SET state=?,updated_at=? WHERE id=?`, stateAfter, now, id); err != nil {
		return err
	}
	return tx.Commit()
}

// Usage, wallet debit, ledger entry and reservation release commit together.
func (s *Server) recordUsageDetailed(r *http.Request, k APIKey, ch provider.Channel, requested, routed, served, endpoint string, status int, u protocol.Usage, latency, ttft time.Duration, affinity string) (resultErr error) {
	attempt := billingState(r)
	cost := int64(0)
	if ch.WorkspaceID == nil {
		var err error
		if attempt.PriceMode == "call" {
			cost = attempt.PriceMicros
		} else if attempt.PriceMode == "video" {
			value := new(big.Int).Mul(big.NewInt(attempt.PriceMicros), big.NewInt(attempt.VideoSeconds))
			if !value.IsInt64() {
				return fmt.Errorf("usage cost exceeds supported range")
			}
			cost = value.Int64()
		} else if attempt.PriceMode == "tokens" {
			cost, err = tokenCostWithRates(attempt.InputRate, attempt.OutputRate, attempt.CacheInputRate, u.Input, u.Output, u.CacheRead, u.CacheWrite)
			if err != nil {
				return err
			}
		} else {
			pricing, err := s.readStoredPricing(context.WithoutCancel(r.Context()))
			if err != nil {
				return err
			}
			cost, err = configuredTokenCost(ch, pricing, routed, u.Input, u.Output, u.CacheRead, u.CacheWrite)
			if err != nil {
				return err
			}
		}
		ratio := attempt.Ratio
		if !attempt.HasRatio {
			ratio = 1
		}
		cost, err = applyGroupRatio(cost, ratio)
		if err != nil {
			return err
		}
	}
	if cost > 0 && attempt.Reserved == 0 {
		return fmt.Errorf("billable usage has no reservation")
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
	defer cancel()
	defer func() {
		if resultErr != nil && attempt.Reserved > 0 {
			if err := s.releaseReservationAs(ctx, attempt.ID, "unknown"); err != nil {
				s.Log.Error("billing_unknown_failed", "reservation", attempt.ID, "error", err)
			}
		}
	}()
	tx, err := s.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	id := attempt.ID
	if id == "" {
		id = auth.RandomID("use_")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if attempt.Reserved > 0 {
		var state string
		var wid, kid string
		var reserved int64
		if err = tx.QueryRowContext(ctx, `SELECT state,workspace_id,api_key_id,amount_micros FROM billing_reservations WHERE id=?`, id).Scan(&state, &wid, &kid, &reserved); err != nil {
			return err
		}
		if wid != k.WorkspaceID || kid != k.ID || reserved != attempt.Reserved {
			return fmt.Errorf("reservation mismatch")
		}
		if state == "settled" {
			return nil
		}
		if state != "held" {
			return fmt.Errorf("reservation is not held")
		}
		var balance, allReserved, spent, otherHeld int64
		var limit sql.NullInt64
		if err = tx.QueryRowContext(ctx, `SELECT balance_micros,reserved_micros FROM wallets WHERE workspace_id=?`, wid).Scan(&balance, &allReserved); err != nil {
			return err
		}
		if err = tx.QueryRowContext(ctx, `SELECT budget_limit_micros,COALESCE((SELECT SUM(cost_micros) FROM usage_records WHERE api_key_id=k.id),0),COALESCE((SELECT SUM(amount_micros) FROM billing_reservations WHERE api_key_id=k.id AND state='held' AND id<>?),0) FROM api_keys k WHERE id=?`, id, kid).Scan(&limit, &spent, &otherHeld); err != nil {
			return err
		}
		if cost > balance-(allReserved-reserved) || limit.Valid && (spent > limit.Int64-otherHeld || cost > limit.Int64-spent-otherHeld) {
			return errQuota
		}
		if _, err = tx.ExecContext(ctx, `UPDATE wallets SET balance_micros=balance_micros-?,reserved_micros=reserved_micros-?,updated_at=? WHERE workspace_id=?`, cost, reserved, now, wid); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE billing_reservations SET state='settled',updated_at=? WHERE id=?`, now, id); err != nil {
			return err
		}
		if cost > 0 {
			if _, err = tx.ExecContext(ctx, `INSERT INTO wallet_entries(id,workspace_id,kind,delta_micros,reason,reference_id,balance_micros,created_at) VALUES(?,?,'charge',?,'Relay usage settlement',?,?,?)`, auth.RandomID("entry_"), wid, -cost, id, balance-cost, now); err != nil {
				return err
			}
		}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO usage_records(id,workspace_id,api_key_id,channel_id,model,endpoint,input_tokens,output_tokens,cost_micros,latency_ms,status,created_at,requested_model,routed_model,served_model,cache_read_tokens,cache_write_tokens,reasoning_tokens,ttft_ms,affinity_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, k.WorkspaceID, k.ID, ch.ID, routed, endpoint, u.Input, u.Output, cost, latency.Milliseconds(), status, now, requested, routed, served, u.CacheRead, u.CacheWrite, u.Reasoning, ttft.Milliseconds(), affinity)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func writeRelayError(w http.ResponseWriter, err error) {
	if errors.Is(err, errQuota) {
		apiError(w, 429, "quota_exceeded", err.Error())
		return
	}
	apiError(w, 502, "upstream_error", err.Error())
}

func streamCompletion(raw []byte, ev protocol.Event) bool {
	if ev.Kind == protocol.EventDone {
		return true
	}
	for _, line := range strings.Split(string(raw), "\n") {
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		var payload struct {
			Type string `json:"type"`
		}
		if json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "data:"))), &payload) == nil && payload.Type == "response.completed" {
			return true
		}
	}
	return false
}

func writeStreamError(w http.ResponseWriter, client, code, message string) {
	value := map[string]any{"error": map[string]any{"type": "api_error", "code": code, "message": message}}
	if client == "anthropic" {
		value["type"] = "error"
	}
	raw, _ := json.Marshal(value)
	if client == "anthropic" {
		fmt.Fprint(w, "event: error\n")
	}
	fmt.Fprintf(w, "data: %s\n\n", raw)
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
}
