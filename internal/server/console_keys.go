package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
)

// consoleAccess is shared by restored management surfaces. Write privileges
// are checked on the server, independently of which controls the UI renders.
func (s *Server) consoleAccess(w http.ResponseWriter, r *http.Request, manage bool) (*auth.Session, string, bool) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead && !s.sameOrigin(r) {
		apiError(w, 403, "bad_origin", "Origin is not allowed.")
		return nil, "", false
	}
	sess, err := s.requireSession(r)
	if err != nil {
		apiError(w, 401, "unauthorized", "Sign in required.")
		return nil, "", false
	}
	var role string
	err = s.Store.DB.QueryRowContext(r.Context(), `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, r.PathValue("wid"), sess.User.ID).Scan(&role)
	if err != nil || (manage && role != "owner" && role != "admin") {
		apiError(w, 403, "forbidden", "Workspace permission required.")
		return nil, "", false
	}
	return sess, role, true
}

type keyProvision struct {
	ID     string          `json:"id"`
	Action string          `json:"action"`
	Name   string          `json:"name"`
	Group  string          `json:"group"`
	Scopes json.RawMessage `json:"scopes"`
	Budget json.RawMessage `json:"budget"`
}

func parseKeyProvision(in keyProvision) (string, []string, *int64, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = "Default"
	}
	if len(name) > 100 {
		return "", nil, nil, fmt.Errorf("name must be at most 100 characters")
	}
	var scopes []string
	if len(in.Scopes) != 0 && string(in.Scopes) != "null" {
		if err := json.Unmarshal(in.Scopes, &scopes); err != nil {
			var text string
			if json.Unmarshal(in.Scopes, &text) != nil {
				return "", nil, nil, fmt.Errorf("scopes must be an array or comma-separated string")
			}
			scopes = strings.Split(text, ",")
		}
	} else {
		scopes = []string{"llm.chat", "llm.systemone", "image.generate", "video.generate", "files.write", "billing.read"}
	}
	allowed := map[string]bool{"llm.chat": true, "llm.systemone": true, "image.generate": true, "video.generate": true, "files.write": true, "billing.read": true, "*": true}
	seen := map[string]bool{}
	clean := []string{}
	for _, scope := range scopes {
		scope = strings.TrimSpace(scope)
		if !allowed[scope] {
			return "", nil, nil, fmt.Errorf("invalid scope %q", scope)
		}
		if !seen[scope] {
			clean = append(clean, scope)
			seen[scope] = true
		}
	}
	if len(clean) == 0 {
		return "", nil, nil, fmt.Errorf("select at least one scope")
	}
	var limit *int64
	if len(in.Budget) > 0 && string(in.Budget) != "null" {
		text := string(in.Budget)
		if strings.HasPrefix(text, `"`) && json.Unmarshal(in.Budget, &text) != nil {
			return "", nil, nil, fmt.Errorf("invalid budget")
		}
		text = strings.TrimSpace(text)
		if text != "" {
			value, ok := new(big.Rat).SetString(text)
			if !ok || value.Sign() <= 0 || strings.ContainsAny(text, "/eE") {
				return "", nil, nil, fmt.Errorf("budget must be a positive decimal USD amount")
			}
			value.Mul(value, big.NewRat(1_000_000, 1))
			if !value.IsInt() || !value.Num().IsInt64() {
				return "", nil, nil, fmt.Errorf("budget supports at most six decimal places")
			}
			micros := value.Num().Int64()
			limit = &micros
		}
	}
	return name, clean, limit, nil
}

func (s *Server) consoleKeys(w http.ResponseWriter, r *http.Request) {
	sess, role, ok := s.consoleAccess(w, r, r.Method != http.MethodGet)
	if !ok {
		return
	}
	wid := r.PathValue("wid")
	if r.Method == http.MethodGet {
		s.consoleListKeys(w, r, sess.User.ID, role)
		return
	}
	id := r.PathValue("id")
	if id == "" {
		id = r.URL.Query().Get("id")
	}
	if r.Method == http.MethodDelete {
		if id == "" {
			apiError(w, 400, "invalid_id", "id is required.")
			return
		}
		result, err := s.Store.DB.ExecContext(r.Context(), `UPDATE api_keys SET enabled=0 WHERE id=? AND workspace_id=?`, id, wid)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			apiError(w, 404, "not_found", "Key not found.")
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	var in keyProvision
	if err := readJSON(r, &in); err != nil {
		apiError(w, 400, "invalid_json", "Invalid key configuration.")
		return
	}
	if id == "" {
		id = in.ID
	}
	if r.Method == http.MethodPatch && in.Action == "rotate" {
		secret := auth.RandomToken("capi_sk_live_")
		result, err := s.Store.DB.ExecContext(r.Context(), `UPDATE api_keys SET key_hash=?,key_prefix=?,secret=? WHERE id=? AND workspace_id=? AND enabled=1`, auth.HashToken(secret), secret[:18], secret, id, wid)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			apiError(w, 409, "key_unavailable", "Active key not found; revoked keys cannot be rotated.")
			return
		}
		writeJSON(w, 200, map[string]any{"id": id, "secret": secret})
		return
	}
	if r.Method == http.MethodPatch && in.Action != "edit" {
		apiError(w, 400, "invalid_action", "Use edit or rotate.")
		return
	}
	name, scopes, budget, err := parseKeyProvision(in)
	if err != nil {
		apiError(w, 400, "invalid_key", err.Error())
		return
	}
	group := strings.TrimSpace(in.Group)
	if group != "" {
		var enabled int
		if s.Store.DB.QueryRowContext(r.Context(), `SELECT enabled FROM model_groups WHERE name=?`, group).Scan(&enabled) != nil || enabled != 1 {
			apiError(w, 400, "invalid_group", "Select an enabled model group.")
			return
		}
	}
	if r.Method == http.MethodPost {
		id = auth.RandomID("key_")
		secret := auth.RandomToken("capi_sk_live_")
		_, err := s.Store.DB.ExecContext(r.Context(), `INSERT INTO api_keys(id,workspace_id,name,key_hash,key_prefix,secret,scopes,enabled,created_at,group_name,budget_limit_micros,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, id, wid, name, auth.HashToken(secret), secret[:18], secret, strings.Join(scopes, ","), 1, time.Now().UTC().Format(time.RFC3339Nano), group, budget, sess.User.ID)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		writeJSON(w, 201, map[string]any{"id": id, "name": name, "secret": secret, "prefix": secret[:18], "scopes": scopes})
		return
	}
	result, err := s.Store.DB.ExecContext(r.Context(), `UPDATE api_keys SET name=?,scopes=?,group_name=?,budget_limit_micros=? WHERE id=? AND workspace_id=?`, name, strings.Join(scopes, ","), group, budget, id, wid)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		apiError(w, 404, "not_found", "Key not found.")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "id": id})
}

func (s *Server) consoleListKeys(w http.ResponseWriter, r *http.Request, uid, role string) {
	query := `SELECT k.id,k.name,k.key_prefix,k.secret,k.scopes,k.enabled,k.created_at,k.last_used_at,k.group_name,k.budget_limit_micros,k.owner_user_id,k.expires_at,COALESCE((SELECT SUM(cost_micros) FROM usage_records WHERE api_key_id=k.id),0) FROM api_keys k WHERE k.workspace_id=?`
	args := []any{r.PathValue("wid")}
	if role == "member" {
		query += ` AND k.owner_user_id=?`
		args = append(args, uid)
	}
	query += ` ORDER BY k.created_at DESC`
	rows, err := s.Store.DB.QueryContext(r.Context(), query, args...)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := []map[string]any{}
	for rows.Next() {
		var id, name, prefix, secret, scopes, created, group, owner string
		var enabled int
		var spent int64
		var last, expires sql.NullString
		var budget sql.NullInt64
		if err := rows.Scan(&id, &name, &prefix, &secret, &scopes, &enabled, &created, &last, &group, &budget, &owner, &expires, &spent); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		var limit, budgetMicros any
		if budget.Valid {
			limit = float64(budget.Int64) / 2
			budgetMicros = budget.Int64
		}
		status := 1
		if enabled != 1 {
			status = 2
		}
		expiry := int64(-1)
		if expires.Valid {
			expiry = parseTimeMillis(expires.String)
			if expiry <= time.Now().UnixMilli() {
				status = 3
			}
		}
		data = append(data, map[string]any{"id": id, "workspaceId": r.PathValue("wid"), "workspace_id": r.PathValue("wid"), "userId": owner, "name": name, "key": prefix + "…", "prefix": prefix, "secret": secret, "scopes": strings.Split(scopes, ","), "status": status, "enabled": enabled == 1, "group": group, "budgetLimitQuota": limit, "budgetSpentQuota": float64(spent) / 2, "budget_limit_micros": budgetMicros, "createdTime": parseTimeMillis(created), "created_at": created, "accessedTime": parseTimeMillis(last.String), "last_used_at": scanNullString(last), "expiredTime": expiry, "modelLimitsEnabled": false, "modelLimits": []string{}, "allowIps": []string{}, "crossGroupRetry": false, "autoGroups": []string{}})
	}
	if err := rows.Err(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"object": "list", "data": data})
}

func parseTimeMillis(value string) int64 {
	t, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return 0
	}
	return t.UnixMilli()
}
