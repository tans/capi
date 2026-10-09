package server

import (
	"net/http"
	"strconv"
	"time"
)

// consoleUsage returns totals independently of pagination: the console must
// not calculate a month's usage from the latest 100 requests.
func (s *Server) consoleUsage(w http.ResponseWriter, r *http.Request) {
	sess, role, ok := s.consoleAccess(w, r, false)
	if !ok {
		return
	}
	q := r.URL.Query()
	days := 30
	if v := q.Get("days"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 365 {
			apiError(w, 400, "invalid_days", "days must be 1–365.")
			return
		}
		days = n
	}
	page, size := 1, 25
	for _, item := range []struct {
		name  string
		value *int
		max   int
	}{{"page", &page, 1000000}, {"pageSize", &size, 100}} {
		if v := q.Get(item.name); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 || n > item.max {
				apiError(w, 400, "invalid_pagination", "Invalid pagination.")
				return
			}
			*item.value = n
		}
	}
	where := `u.workspace_id=? AND u.created_at>=?`
	args := []any{r.PathValue("wid"), time.Now().UTC().AddDate(0, 0, -days).Format(time.RFC3339Nano)}
	if role == "member" {
		where += ` AND EXISTS(SELECT 1 FROM api_keys k WHERE k.id=u.api_key_id AND k.owner_user_id=?)`
		args = append(args, sess.User.ID)
	}
	if key := q.Get("keyId"); key != "" {
		where += ` AND u.api_key_id=?`
		args = append(args, key)
	}
	if model := q.Get("model"); model != "" {
		where += ` AND (u.requested_model=? OR u.routed_model=?)`
		args = append(args, model, model)
	}
	if status := q.Get("status"); status != "" {
		switch status {
		case "success":
			where += ` AND u.status BETWEEN 200 AND 399`
		case "error":
			where += ` AND (u.status<200 OR u.status>=400)`
		default:
			apiError(w, 400, "invalid_status", "Use success or error.")
			return
		}
	}
	var count, tokens, cost, failed int64
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*),COALESCE(SUM(input_tokens+output_tokens),0),COALESCE(SUM(cost_micros),0),COALESCE(SUM(CASE WHEN status<200 OR status>=400 THEN 1 ELSE 0 END),0) FROM usage_records u WHERE `+where, args...).Scan(&count, &tokens, &cost, &failed); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	models := []map[string]any{}
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT routed_model,COUNT(*),SUM(input_tokens+output_tokens),SUM(cost_micros) FROM usage_records u WHERE `+where+` GROUP BY routed_model ORDER BY SUM(cost_micros) DESC,COUNT(*) DESC`, args...)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	for rows.Next() {
		var model string
		var requests, tk, c int64
		if err = rows.Scan(&model, &requests, &tk, &c); err != nil {
			rows.Close()
			apiError(w, 500, "database_error", err.Error())
			return
		}
		models = append(models, map[string]any{"model": model, "requests": requests, "tokens": tk, "cost_micros": c})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	daily := []map[string]any{}
	rows, err = s.Store.DB.QueryContext(r.Context(), `SELECT substr(created_at,1,10),COUNT(*),SUM(cost_micros) FROM usage_records u WHERE `+where+` GROUP BY substr(created_at,1,10) ORDER BY substr(created_at,1,10)`, args...)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	for rows.Next() {
		var date string
		var requests, c int64
		if err = rows.Scan(&date, &requests, &c); err != nil {
			rows.Close()
			apiError(w, 500, "database_error", err.Error())
			return
		}
		daily = append(daily, map[string]any{"date": date, "requests": requests, "cost_micros": c})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	query := `SELECT u.id,u.api_key_id,COALESCE(k.name,''),u.requested_model,u.routed_model,u.served_model,u.endpoint,u.input_tokens,u.output_tokens,u.cost_micros,u.latency_ms,u.ttft_ms,u.status,u.created_at,COALESCE(u.prompt_text,'') FROM usage_records u LEFT JOIN api_keys k ON k.id=u.api_key_id WHERE ` + where + ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
	listArgs := append(append([]any{}, args...), size, (page-1)*size)
	rows, err = s.Store.DB.QueryContext(r.Context(), query, listArgs...)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := []map[string]any{}
	for rows.Next() {
		var id, key, name, requested, routed, served, endpoint, created, prompt string
		var input, output, c, lat, ttft int64
		var status int
		if err = rows.Scan(&id, &key, &name, &requested, &routed, &served, &endpoint, &input, &output, &c, &lat, &ttft, &status, &created, &prompt); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		data = append(data, map[string]any{"id": id, "keyId": key, "keyName": name, "requestModel": requested, "model": routed, "upstreamModel": served, "endpoint": endpoint, "prompt": prompt, "promptTokens": input, "completionTokens": output, "quota": float64(c) / 2, "durationMs": lat, "firstByteMs": ttft, "statusCode": status, "success": status >= 200 && status < 400, "createdAt": parseTimeMillis(created), "requested_model": requested, "routed_model": routed, "served_model": served, "input_tokens": input, "output_tokens": output, "cost_micros": c, "latency_ms": lat, "ttft_ms": ttft, "status": status, "created_at": created})
	}
	if err = rows.Err(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"data": data, "total": count, "page": page, "pageSize": size, "days": days, "summary": map[string]any{"requests": count, "tokens": tokens, "cost_micros": cost, "failed": failed}, "models": models, "daily": daily})
}
