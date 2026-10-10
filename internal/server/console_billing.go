package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
)

func queryInt(r *http.Request, key string, fallback, min, max int) (int, error) {
	text := r.URL.Query().Get(key)
	if text == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(text)
	if err != nil || value < min || value > max {
		return 0, fmt.Errorf("%s must be between %d and %d", key, min, max)
	}
	return value, nil
}

func (s *Server) consoleBilling(w http.ResponseWriter, r *http.Request) {
	_, _, ok := s.consoleAccess(w, r, false)
	if !ok {
		return
	}
	wid := r.PathValue("wid")
	page, err := queryInt(r, "page", 1, 1, 1_000_000)
	if err != nil {
		apiError(w, 400, "invalid_page", err.Error())
		return
	}
	var balance, reserved int64
	var currency string
	if err = s.Store.DB.QueryRowContext(r.Context(), `SELECT balance_micros,reserved_micros,currency FROM wallets WHERE workspace_id=?`, wid).Scan(&balance, &reserved, &currency); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	var total, unresolved int
	if err = s.Store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM wallet_entries WHERE workspace_id=?`, wid).Scan(&total); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if err = s.Store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM billing_reservations WHERE workspace_id=? AND state='unknown'`, wid).Scan(&unresolved); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT id,kind,delta_micros,reason,balance_micros,created_at FROM wallet_entries WHERE workspace_id=? ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?`, wid, (page-1)*20)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	entries := []map[string]any{}
	for rows.Next() {
		var id, kind, reason, created string
		var delta, after int64
		if err = rows.Scan(&id, &kind, &delta, &reason, &after, &created); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		entries = append(entries, map[string]any{"id": id, "kind": kind, "delta_micros": delta, "reason": reason, "balance_micros": after, "created_at": created})
	}
	if err = rows.Err(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"balance_micros": balance, "reserved_micros": reserved, "available_micros": balance - reserved, "unresolved_requests": unresolved, "currency": currency, "data": entries, "total": total, "page": page, "pageSize": 20})
}

func creditWallet(tx *sql.Tx, wid string, amount int64, kind, reason, reference string) (int64, error) {
	var balance int64
	if amount <= 0 {
		return 0, fmt.Errorf("credit must be positive")
	}
	if err := tx.QueryRow(`SELECT balance_micros FROM wallets WHERE workspace_id=?`, wid).Scan(&balance); err != nil {
		return 0, err
	}
	if balance > math.MaxInt64-amount {
		return 0, fmt.Errorf("credit exceeds supported balance")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	balance += amount
	if _, err := tx.Exec(`UPDATE wallets SET balance_micros=?,updated_at=? WHERE workspace_id=?`, balance, now, wid); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(`INSERT INTO wallet_entries(id,workspace_id,kind,delta_micros,reason,reference_id,balance_micros,created_at) VALUES(?,?,?,?,?,?,?,?)`, auth.RandomID("entry_"), wid, kind, amount, reason, reference, balance, now); err != nil {
		return 0, err
	}
	return balance, nil
}

func (s *Server) consoleAdminCredit(w http.ResponseWriter, r *http.Request) {
	if !s.sameOrigin(r) {
		apiError(w, 403, "bad_origin", "Origin is not allowed.")
		return
	}
	if _, err := s.requireAdmin(r); err != nil {
		apiError(w, 403, "forbidden", "Admin required.")
		return
	}
	var in struct {
		Micros int64  `json:"micros"`
		Reason string `json:"reason"`
	}
	if readJSON(r, &in) != nil || in.Micros <= 0 || len(in.Reason) > 500 {
		apiError(w, 400, "invalid_credit", "Positive micros and a reason of at most 500 characters are required.")
		return
	}
	if in.Reason == "" {
		in.Reason = "Administrator credit"
	}
	tx, err := s.Store.DB.BeginTx(r.Context(), nil)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer tx.Rollback()
	_, err = creditWallet(tx, r.PathValue("wid"), in.Micros, "adjustment", in.Reason, auth.RandomID("credit_"))
	if err == sql.ErrNoRows {
		apiError(w, 404, "not_found", "Workspace wallet not found.")
		return
	}
	if err != nil {
		apiError(w, 400, "invalid_credit", err.Error())
		return
	}
	if err = tx.Commit(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	s.writeBalance(w, r, r.PathValue("wid"))
}

func (s *Server) consoleRedeem(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code        string `json:"code"`
		WorkspaceID string `json:"workspaceId"`
	}
	if readJSON(r, &in) != nil || strings.TrimSpace(in.Code) == "" || len(in.Code) > 200 {
		apiError(w, 400, "invalid_code", "Enter a valid redemption code.")
		return
	}
	r.SetPathValue("wid", in.WorkspaceID)
	sess, _, ok := s.consoleAccess(w, r, true)
	if !ok {
		return
	}
	tx, err := s.Store.DB.BeginTx(r.Context(), nil)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer tx.Rollback()
	var id, name string
	var amount int64
	var enabled int
	var expires, redeemed, wid, uid sql.NullString
	err = tx.QueryRowContext(r.Context(), `SELECT id,name,amount_micros,enabled,expires_at,redeemed_at,redeemed_workspace_id,redeemed_user_id FROM redeem_codes WHERE code_hash=?`, auth.HashToken(strings.TrimSpace(in.Code))).Scan(&id, &name, &amount, &enabled, &expires, &redeemed, &wid, &uid)
	if err == sql.ErrNoRows {
		apiError(w, 400, "invalid_code", "Redemption code is unavailable.")
		return
	}
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if redeemed.Valid {
		if wid.String != in.WorkspaceID || uid.String != sess.User.ID {
			apiError(w, 409, "code_used", "Redemption code has already been used.")
			return
		}
		writeJSON(w, 200, map[string]any{"amount": float64(amount) / 1_000_000, "replayed": true})
		return
	}
	if enabled != 1 || expires.Valid && parseTimeMillis(expires.String) <= time.Now().UnixMilli() {
		apiError(w, 400, "invalid_code", "Redemption code is disabled or expired.")
		return
	}
	if _, err = creditWallet(tx, in.WorkspaceID, amount, "redeem", "Redemption: "+name, "redeem_"+id); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE redeem_codes SET redeemed_at=?,redeemed_workspace_id=?,redeemed_user_id=? WHERE id=?`, time.Now().UTC().Format(time.RFC3339Nano), in.WorkspaceID, sess.User.ID, id); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if err = tx.Commit(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"amount": float64(amount) / 1_000_000, "replayed": false})
}

func (s *Server) consoleAdminRedeemCodes(w http.ResponseWriter, r *http.Request) {
	if !s.sameOrigin(r) {
		apiError(w, 403, "bad_origin", "Origin is not allowed.")
		return
	}
	if _, err := s.requireAdmin(r); err != nil {
		apiError(w, 403, "forbidden", "Admin required.")
		return
	}
	if r.Method == http.MethodPost {
		var in struct {
			Name      string          `json:"name"`
			Amount    json.RawMessage `json:"amount"`
			Count     int             `json:"count"`
			ExpiresAt *int64          `json:"expiresAt"`
		}
		if readJSON(r, &in) != nil || len(in.Name) > 100 {
			apiError(w, 400, "invalid_code", "Invalid code configuration.")
			return
		}
		_, _, amount, err := parseKeyProvision(keyProvision{Budget: in.Amount})
		if err != nil || amount == nil {
			apiError(w, 400, "invalid_amount", "Enter a positive USD amount with at most six decimal places.")
			return
		}
		if in.Count == 0 {
			in.Count = 1
		}
		if in.Count < 1 || in.Count > 100 {
			apiError(w, 400, "invalid_count", "Create 1–100 codes at a time.")
			return
		}
		var expiry *string
		if in.ExpiresAt != nil {
			if *in.ExpiresAt <= time.Now().UnixMilli() {
				apiError(w, 400, "invalid_expiry", "Expiry must be in the future.")
				return
			}
			text := time.UnixMilli(*in.ExpiresAt).UTC().Format(time.RFC3339Nano)
			expiry = &text
		}
		if in.Name == "" {
			in.Name = "Credit"
		}
		tx, err := s.Store.DB.BeginTx(r.Context(), nil)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		defer tx.Rollback()
		codes := []map[string]any{}
		for i := 0; i < in.Count; i++ {
			id := auth.RandomID("redeem_")
			code := auth.RandomToken("CAPI-")
			now := time.Now().UTC().Format(time.RFC3339Nano)
			if _, err = tx.ExecContext(r.Context(), `INSERT INTO redeem_codes(id,code_hash,secret_code,name,amount_micros,expires_at,created_at) VALUES(?,?,?,?,?,?,?)`, id, auth.HashToken(code), code, in.Name, *amount, expiry, now); err != nil {
				apiError(w, 500, "database_error", err.Error())
				return
			}
			codes = append(codes, map[string]any{"id": id, "code": code, "amount": float64(*amount) / 1_000_000})
		}
		if err = tx.Commit(); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		writeJSON(w, 201, map[string]any{"data": codes, "code": codes[0]["code"], "id": codes[0]["id"]})
		return
	}
	if r.Method == http.MethodPatch {
		var in struct {
			ID      string `json:"id"`
			Enabled bool   `json:"enabled"`
		}
		if readJSON(r, &in) != nil {
			apiError(w, 400, "invalid_json", "Invalid code update.")
			return
		}
		result, err := s.Store.DB.ExecContext(r.Context(), `UPDATE redeem_codes SET enabled=? WHERE id=? AND redeemed_at IS NULL`, in.Enabled, in.ID)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		n, _ := result.RowsAffected()
		if n != 1 {
			apiError(w, 409, "code_unavailable", "Unused code not found.")
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	pricing, err := s.readStoredPricing(r.Context())
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT c.id,c.secret_code,c.name,c.amount_micros,c.enabled,c.expires_at,c.created_at,c.redeemed_at,c.redeemed_workspace_id,c.redeemed_user_id,COALESCE(w.name,''),COALESCE(u.name,''),COALESCE(u.email,'') FROM redeem_codes c LEFT JOIN workspaces w ON w.id=c.redeemed_workspace_id LEFT JOIN users u ON u.id=c.redeemed_user_id ORDER BY c.created_at DESC LIMIT 500`)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := []map[string]any{}
	for rows.Next() {
		var id, code, name, created, workspaceName, userName, email string
		var amount int64
		var enabled int
		var expires, redeemed, wid, uid sql.NullString
		if err = rows.Scan(&id, &code, &name, &amount, &enabled, &expires, &created, &redeemed, &wid, &uid, &workspaceName, &userName, &email); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		status := "available"
		if enabled != 1 {
			status = "disabled"
		}
		if expires.Valid && parseTimeMillis(expires.String) <= time.Now().UnixMilli() {
			status = "expired"
		}
		if redeemed.Valid {
			status = "redeemed"
		}
		data = append(data, map[string]any{"code": code, "currency": pricing.Currency.Code, "currencySymbol": pricing.Currency.Symbol, "status": status, "redeemed_at": nullableMillis(redeemed), "expires_at": nullableMillis(expires), "redeemed_by": scanNullString(uid), "workspace_id": scanNullString(wid), "workspace_name": workspaceName, "redeemed_by_name": userName, "redeemed_by_email": email, "id": id, "name": name, "amount": float64(amount) / 1_000_000, "enabled": enabled == 1, "expiresAt": scanNullString(expires), "createdAt": created, "redeemedAt": scanNullString(redeemed), "workspaceId": scanNullString(wid)})
	}
	if err = rows.Err(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"data": data})
}

func nullableMillis(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return parseTimeMillis(value.String)
}
