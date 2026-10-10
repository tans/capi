package server

import (
	"database/sql"
	"math"
	"net/http"
	"time"

	"github.com/tans/capi/internal/auth"
)

func (s *Server) consoleAdminUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && !s.sameOrigin(r) {
		apiError(w, http.StatusForbidden, "bad_origin", "Origin is not allowed.")
		return
	}
	if _, err := s.requireAdmin(r); err != nil {
		apiError(w, http.StatusForbidden, "forbidden", "Admin required.")
		return
	}
	if r.Method == http.MethodGet {
		s.listAdminUsers(w, r)
		return
	}
	if r.Method == http.MethodPatch {
		s.updateAdminUser(w, r)
		return
	}
	apiError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Unsupported user operation.")
}

func (s *Server) listAdminUsers(w http.ResponseWriter, r *http.Request) {
	pricing, err := s.readStoredPricing(r.Context())
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT u.id,u.email,u.name,u.role,u.created_at,
	COALESCE((SELECT x.balance_micros FROM workspaces pw JOIN workspace_members pm ON pm.workspace_id=pw.id AND pm.user_id=u.id AND pm.role='owner' JOIN wallets x ON x.workspace_id=pw.id WHERE pw.kind='personal' ORDER BY pw.created_at LIMIT 1),0),
	COALESCE((SELECT SUM(ur.cost_micros) FROM usage_records ur JOIN api_keys k ON k.id=ur.api_key_id WHERE k.owner_user_id=u.id),0),
	(SELECT MAX(ur.created_at) FROM usage_records ur JOIN api_keys k ON k.id=ur.api_key_id WHERE k.owner_user_id=u.id)
	FROM users u ORDER BY u.created_at DESC,u.id`)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := make([]map[string]any, 0)
	for rows.Next() {
		var id, email, name, role, created string
		var balance, spent int64
		var lastUsed sql.NullString
		if err := rows.Scan(&id, &email, &name, &role, &created, &balance, &spent, &lastUsed); err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", err.Error())
			return
		}
		var used any
		if lastUsed.Valid {
			used = parseTimeMillis(lastUsed.String)
		}
		data = append(data, map[string]any{
			"id": id, "email": email, "name": name, "role": role,
			"created_at": parseTimeMillis(created), "last_used_at": used,
			"balance":  float64(balance) / 1_000_000,
			"spent":    float64(spent) / 1_000_000,
			"currency": pricing.Currency.Code, "currencySymbol": pricing.Currency.Symbol,
		})
	}
	if err := rows.Err(); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (s *Server) updateAdminUser(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("id")
	if userID == "" {
		apiError(w, http.StatusBadRequest, "invalid_user_id", "User ID is required.")
		return
	}
	var in struct {
		Role    *string  `json:"role"`
		Balance *float64 `json:"balance"`
	}
	if readJSON(r, &in) != nil || in.Role == nil && in.Balance == nil {
		apiError(w, http.StatusBadRequest, "invalid_user", "Provide a role or balance update.")
		return
	}
	if in.Role != nil && *in.Role != "user" && *in.Role != "admin" {
		apiError(w, http.StatusBadRequest, "invalid_role", "Role must be user or admin.")
		return
	}
	var targetBalance int64
	if in.Balance != nil {
		if math.IsNaN(*in.Balance) || math.IsInf(*in.Balance, 0) || *in.Balance < 0 {
			apiError(w, http.StatusBadRequest, "invalid_balance", "Balance must be a finite, non-negative amount.")
			return
		}
		micros := *in.Balance * 1_000_000
		if math.IsNaN(micros) || math.IsInf(micros, 0) || micros > math.MaxInt64 {
			apiError(w, http.StatusBadRequest, "invalid_balance", "Balance exceeds the supported amount.")
			return
		}
		targetBalance = int64(math.Round(micros))
	}

	tx, err := s.Store.DB.BeginTx(r.Context(), nil)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	defer tx.Rollback()
	if in.Role != nil {
		var currentRole string
		if err := tx.QueryRowContext(r.Context(), `SELECT role FROM users WHERE id=?`, userID).Scan(&currentRole); err != nil {
			apiError(w, http.StatusNotFound, "user_not_found", "User not found.")
			return
		}
		if currentRole == "admin" && *in.Role != "admin" {
			var admins int
			if err := tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users WHERE role='admin'`).Scan(&admins); err != nil {
				apiError(w, http.StatusInternalServerError, "database_error", err.Error())
				return
			}
			if admins <= 1 {
				apiError(w, http.StatusConflict, "last_admin", "The last administrator cannot be demoted.")
				return
			}
		}
		if _, err := tx.ExecContext(r.Context(), `UPDATE users SET role=? WHERE id=?`, *in.Role, userID); err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", err.Error())
			return
		}
	}
	if in.Balance != nil {
		var workspaceID string
		var currentBalance, reserved int64
		if err := tx.QueryRowContext(r.Context(), `SELECT pw.id,x.balance_micros,x.reserved_micros FROM workspaces pw JOIN workspace_members pm ON pm.workspace_id=pw.id AND pm.user_id=? AND pm.role='owner' JOIN wallets x ON x.workspace_id=pw.id WHERE pw.kind='personal' ORDER BY pw.created_at LIMIT 1`, userID).Scan(&workspaceID, &currentBalance, &reserved); err != nil {
			apiError(w, http.StatusConflict, "wallet_unavailable", "User personal wallet is unavailable.")
			return
		}
		if targetBalance < reserved {
			apiError(w, http.StatusConflict, "balance_reserved", "Balance cannot be lower than funds reserved for in-flight requests.")
			return
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		if _, err := tx.ExecContext(r.Context(), `UPDATE wallets SET balance_micros=?,updated_at=? WHERE workspace_id=?`, targetBalance, now, workspaceID); err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", err.Error())
			return
		}
		delta := targetBalance - currentBalance
		if delta != 0 {
			if _, err := tx.ExecContext(r.Context(), `INSERT INTO wallet_entries(id,workspace_id,kind,delta_micros,reason,reference_id,balance_micros,created_at) VALUES(?,?,?,?,?,?,?,?)`, auth.RandomID("entry_"), workspaceID, "adjustment", delta, "Administrator balance adjustment", auth.RandomID("adminbal_"), targetBalance, now); err != nil {
				apiError(w, http.StatusInternalServerError, "database_error", err.Error())
				return
			}
		}
	}
	if err := tx.Commit(); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"updated": true, "id": userID})
}
