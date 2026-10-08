package server

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
)

func requestID(r *http.Request) string {
	value := strings.TrimSpace(r.Header.Get("X-Request-ID"))
	if value == "" || len(value) > 200 {
		return auth.RandomID("req_")
	}
	return value
}

// recordUserPrompts stores only caller-provided user messages. It is kept
// separate from JEV decisions so prompt logging can be enabled without
// enabling routing or security auditing.
func (s *Server) recordUserPrompts(ctx context.Context, r *http.Request, k APIKey, model, endpoint string, body []byte) {
	settings, err := readJevWorkspaceSettings(ctx, s, k.WorkspaceID)
	if err != nil || !settings.PromptLoggingEnabled {
		return
	}
	prompts := extractUserPrompts(endpoint, body)
	if len(prompts) == 0 {
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	request := requestID(r)
	tx, err := s.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		s.Log.Warn("prompt_log_transaction_failed", "error", err)
		return
	}
	defer tx.Rollback()
	for index, prompt := range prompts {
		if len([]rune(prompt)) > 100000 {
			prompt = truncateText(prompt, 100000)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO prompt_logs(id,workspace_id,api_key_id,request_id,endpoint,model,prompt_text,sequence,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, auth.RandomID("prompt_"), k.WorkspaceID, k.ID, request, endpoint, model, prompt, index, now); err != nil {
			s.Log.Warn("prompt_log_record_failed", "error", err)
			return
		}
	}
	cutoff := time.Now().UTC().Add(-90 * 24 * time.Hour).Format(time.RFC3339Nano)
	if _, err := tx.ExecContext(ctx, `DELETE FROM prompt_logs WHERE created_at<?`, cutoff); err != nil {
		s.Log.Warn("prompt_log_prune_failed", "error", err)
		return
	}
	if err := tx.Commit(); err != nil {
		s.Log.Warn("prompt_log_commit_failed", "error", err)
	}
}

func (s *Server) consolePrompts(w http.ResponseWriter, r *http.Request) {
	sess, role, ok := s.consoleAccess(w, r, false)
	if !ok {
		return
	}
	settings, err := readJevWorkspaceSettings(r.Context(), s, r.PathValue("wid"))
	if err != nil {
		apiError(w, http.StatusNotFound, "not_found", "Workspace not found.")
		return
	}
	days, limit := 90, 200
	if raw := r.URL.Query().Get("days"); raw != "" {
		days, err = strconv.Atoi(raw)
		if err != nil || days < 1 || days > 365 {
			apiError(w, http.StatusBadRequest, "invalid_days", "days must be between 1 and 365.")
			return
		}
	}
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 500 {
			apiError(w, http.StatusBadRequest, "invalid_limit", "limit must be between 1 and 500.")
			return
		}
	}
	query := `SELECT p.id,p.request_id,p.api_key_id,COALESCE(k.name,''),p.endpoint,p.model,p.prompt_text,p.sequence,p.created_at FROM prompt_logs p JOIN api_keys k ON k.id=p.api_key_id WHERE p.workspace_id=? AND p.created_at>=?`
	args := []any{r.PathValue("wid"), time.Now().UTC().AddDate(0, 0, -days).Format(time.RFC3339Nano)}
	if role == "member" {
		query += ` AND k.owner_user_id=?`
		args = append(args, sess.User.ID)
	}
	query += ` ORDER BY p.created_at DESC,p.sequence ASC LIMIT ?`
	args = append(args, limit)
	rows, err := s.Store.DB.QueryContext(r.Context(), query, args...)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := []map[string]any{}
	for rows.Next() {
		var id, request, key, keyName, endpoint, model, text, created string
		var sequence int
		if err := rows.Scan(&id, &request, &key, &keyName, &endpoint, &model, &text, &sequence, &created); err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", err.Error())
			return
		}
		data = append(data, map[string]any{"id": id, "requestId": request, "keyId": key, "keyName": keyName, "endpoint": endpoint, "model": model, "prompt": text, "sequence": sequence, "createdAt": created})
	}
	if err := rows.Err(); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"workspaceId": r.PathValue("wid"), "enabled": settings.PromptLoggingEnabled, "retentionDays": 90, "data": data})
}
