package server

import (
	"net/http"
	"strconv"
	"strings"
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
	if role != "owner" && role != "admin" {
		where += ` AND EXISTS(SELECT 1 FROM api_keys owned WHERE owned.id=p.api_key_id AND owned.workspace_id=p.workspace_id AND owned.owner_user_id=?)`
		args = append(args, sess.User.ID)
	}
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(search)) > 200 {
		apiError(w, 400, "invalid_search", "Search must be at most 200 characters.")
		return
	}
	if search != "" {
		// Match the request, then return all its prompt parts in their original order.
		where += ` AND EXISTS(SELECT 1 FROM prompt_logs matched WHERE matched.workspace_id=p.workspace_id AND matched.api_key_id=p.api_key_id AND matched.request_id=p.request_id AND instr(lower(matched.prompt_text),lower(?))>0)`
		args = append(args, search)
	}
	var total int
	countQuery := `SELECT COUNT(*) FROM (SELECT p.workspace_id,p.request_id,p.api_key_id FROM prompt_logs p WHERE ` + where + ` GROUP BY p.workspace_id,p.request_id,p.api_key_id)`
	if err := s.Store.DB.QueryRowContext(r.Context(), countQuery, args...).Scan(&total); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	query := `WITH recent AS (
		SELECT p.workspace_id,p.request_id,p.api_key_id,MAX(p.endpoint) AS endpoint,MAX(p.model) AS model,MAX(p.created_at) AS created_at
		FROM prompt_logs p WHERE ` + where + ` GROUP BY p.workspace_id,p.request_id,p.api_key_id
		ORDER BY MAX(p.created_at) DESC,p.request_id DESC LIMIT ? OFFSET ?
	) SELECT recent.request_id,recent.api_key_id,COALESCE(k.name,''),COALESCE(owner.name,''),recent.endpoint,recent.model,recent.created_at,
		(SELECT group_concat(prompt_text,char(10)||char(10)) FROM (SELECT prompt_text FROM prompt_logs part
		WHERE part.workspace_id=recent.workspace_id AND part.api_key_id=recent.api_key_id AND part.request_id=recent.request_id ORDER BY sequence))
		FROM recent LEFT JOIN api_keys k ON k.id=recent.api_key_id AND k.workspace_id=recent.workspace_id
		LEFT JOIN users owner ON owner.id=k.owner_user_id ORDER BY recent.created_at DESC,recent.request_id DESC`
	listArgs := append(append([]any{}, args...), size, (page-1)*size)
	rows, err := s.Store.DB.QueryContext(r.Context(), query, listArgs...)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := make([]map[string]any, 0)
	for rows.Next() {
		var requestID, keyID, keyName, ownerName, endpoint, model, created, prompt string
		if err := rows.Scan(&requestID, &keyID, &keyName, &ownerName, &endpoint, &model, &created, &prompt); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		data = append(data, map[string]any{"requestId": requestID, "keyId": keyID, "keyName": keyName, "ownerName": ownerName, "endpoint": endpoint, "model": model, "createdAt": parseTimeMillis(created), "prompt": prompt})
	}
	if err := rows.Err(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"data": data, "total": total, "page": page, "pageSize": size, "days": days})
}
