package server

import (
	"net/http"
	"strconv"
	"time"
)

func (s *Server) consolePrompts(w http.ResponseWriter, r *http.Request) {
	sess, role, ok := s.consoleAccess(w, r, false)
	if !ok {
		return
	}
	page, size := 1, 25
	for _, item := range []struct {
		name  string
		value *int
		max   int
	}{{"page", &page, 1000000}, {"pageSize", &size, 100}} {
		if value := r.URL.Query().Get(item.name); value != "" {
			n, err := strconv.Atoi(value)
			if err != nil || n < 1 || n > item.max {
				apiError(w, 400, "invalid_pagination", "Invalid pagination.")
				return
			}
			*item.value = n
		}
	}
	days := 30
	if value := r.URL.Query().Get("days"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 || n > 90 {
			apiError(w, 400, "invalid_days", "days must be 1–90.")
			return
		}
		days = n
	}
	wid := r.PathValue("wid")
	where := `p.workspace_id=? AND p.created_at>=?`
	args := []any{wid, time.Now().UTC().AddDate(0, 0, -days).Format(time.RFC3339Nano)}
	if role == "member" {
		where += ` AND EXISTS(SELECT 1 FROM api_keys owned WHERE owned.id=p.api_key_id AND owned.owner_user_id=?)`
		args = append(args, sess.User.ID)
	}
	var total int
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT COUNT(DISTINCT p.request_id) FROM prompt_logs p WHERE `+where, args...).Scan(&total); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	query := `SELECT p.request_id,p.api_key_id,COALESCE(k.name,''),MAX(p.endpoint),MAX(p.model),MAX(p.created_at),
		(SELECT group_concat(prompt_text,char(10)||char(10)) FROM (SELECT prompt_text FROM prompt_logs part WHERE part.request_id=p.request_id ORDER BY sequence))
		FROM prompt_logs p LEFT JOIN api_keys k ON k.id=p.api_key_id WHERE ` + where +
		` GROUP BY p.request_id,p.api_key_id,k.name ORDER BY MAX(p.created_at) DESC LIMIT ? OFFSET ?`
	listArgs := append(append([]any{}, args...), size, (page-1)*size)
	rows, err := s.Store.DB.QueryContext(r.Context(), query, listArgs...)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := make([]map[string]any, 0)
	for rows.Next() {
		var requestID, keyID, keyName, endpoint, model, created, prompt string
		if err := rows.Scan(&requestID, &keyID, &keyName, &endpoint, &model, &created, &prompt); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		data = append(data, map[string]any{"requestId": requestID, "keyId": keyID, "keyName": keyName, "endpoint": endpoint, "model": model, "createdAt": parseTimeMillis(created), "prompt": prompt})
	}
	if err := rows.Err(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"data": data, "total": total, "page": page, "pageSize": size, "days": days})
}
