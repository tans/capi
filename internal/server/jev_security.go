package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
)

func (s *Server) recordWorkspaceJev(r *http.Request, k APIKey, requested, routed, path string, body []byte) {
	settings, err := readJevWorkspaceSettings(r.Context(), s, k.WorkspaceID)
	if err != nil || (!settings.AutoRoutingEnabled && !settings.SecurityAuditEnabled) {
		return
	}
	text := extractJevText(path, body)
	intent, complexity := classifyJevText(text)
	categories, severity, confidence, evidence := jevSecurityAssessment(text)
	if !settings.SecurityAuditEnabled {
		categories, severity, confidence = []string{}, "none", 0
		evidence = map[string]any{}
	}
	routeIntent, routeComplexity := any(nil), any(nil)
	routeConfidence := any(nil)
	if settings.AutoRoutingEnabled && routed != requested {
		routeIntent, routeComplexity = intent, complexity
		// Local routing is deterministic once a permitted channel is selected.
		routeConfidence = 1.0
	}
	requestID := strings.TrimSpace(r.Header.Get("X-Request-ID"))
	if requestID == "" || len(requestID) > 200 {
		requestID = auth.RandomID("req_")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	decisionID := auth.RandomID("jev_")
	categoriesJSON, _ := json.Marshal(categories)
	evidenceJSON, _ := json.Marshal(evidence)
	maskedText := truncateText(jevMaskSecrets(text), 10000)
	_, err = s.Store.DB.ExecContext(r.Context(), `INSERT INTO jev_decisions(id,workspace_id,request_id,api_key_id,original_text,route_intent,route_complexity,route_confidence,security_categories,security_severity,security_confidence,detector,jev_request_id,prompt_tokens,quota_micros,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		decisionID, k.WorkspaceID, requestID, k.ID, maskedText, routeIntent, routeComplexity, routeConfidence, string(categoriesJSON), severity, confidenceOrNil(confidence), "local", "", 0, 0, now)
	if err != nil {
		s.Log.Warn("jev_decision_record_failed", "error", err)
		return
	}
	if settings.SecurityAuditEnabled && severity != "none" {
		incidentID := auth.RandomID("inc_")
		if _, err := s.Store.DB.ExecContext(r.Context(), `INSERT INTO security_incidents(id,workspace_id,request_id,api_key_id,direction,severity,detector,categories,confidence,evidence,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, incidentID, k.WorkspaceID, requestID, k.ID, "input", severity, "local", string(categoriesJSON), confidence, string(evidenceJSON), "open", now); err != nil {
			s.Log.Warn("security_incident_record_failed", "error", err)
		}
	}
	cutoff := time.Now().UTC().Add(-90 * 24 * time.Hour).Format(time.RFC3339Nano)
	if _, err := s.Store.DB.ExecContext(r.Context(), `DELETE FROM jev_decisions WHERE created_at<?`, cutoff); err != nil {
		s.Log.Warn("jev_decision_prune_failed", "error", err)
	}
	if _, err := s.Store.DB.ExecContext(r.Context(), `DELETE FROM security_incidents WHERE created_at<?`, cutoff); err != nil {
		s.Log.Warn("security_incident_prune_failed", "error", err)
	}
}

func confidenceOrNil(value float64) any {
	if value <= 0 {
		return nil
	}
	return value
}

func (s *Server) securityDecisions(w http.ResponseWriter, r *http.Request) {
	sess, role, ok := s.consoleAccess(w, r, false)
	if !ok {
		return
	}
	wid := r.PathValue("wid")
	limit := 100
	if raw := r.URL.Query().Get("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 200 {
			apiError(w, 400, "invalid_limit", "limit must be between 1 and 200.")
			return
		}
		limit = value
	}
	query := `SELECT d.id,d.request_id,d.api_key_id,d.route_intent,d.route_complexity,d.route_confidence,d.security_categories,d.security_severity,d.security_confidence,d.detector,d.jev_request_id,d.prompt_tokens,d.quota_micros,d.created_at,k.owner_user_id FROM jev_decisions d JOIN api_keys k ON k.id=d.api_key_id WHERE d.workspace_id=? AND d.created_at>=?`
	args := []any{wid, time.Now().UTC().Add(-90 * 24 * time.Hour).Format(time.RFC3339Nano)}
	if role == "member" {
		query += ` AND k.owner_user_id=?`
		args = append(args, sess.User.ID)
	}
	query += ` ORDER BY d.created_at DESC LIMIT ?`
	args = append(args, limit)
	rows, err := s.Store.DB.QueryContext(r.Context(), query, args...)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := []map[string]any{}
	for rows.Next() {
		var id, requestID, keyID, categories, severity, detector, jevRequest, created, owner string
		var intent, complexity sql.NullString
		var routeConfidence, securityConfidence sql.NullFloat64
		var prompt, quota int64
		if err := rows.Scan(&id, &requestID, &keyID, &intent, &complexity, &routeConfidence, &categories, &severity, &securityConfidence, &detector, &jevRequest, &prompt, &quota, &created, &owner); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		var decoded []string
		_ = json.Unmarshal([]byte(categories), &decoded)
		data = append(data, map[string]any{"id": id, "requestId": requestID, "keyId": keyID, "routeIntent": nullString(intent.String), "routeComplexity": nullString(complexity.String), "routeConfidence": nullableFloat(routeConfidence), "securityCategories": decoded, "securitySeverity": severity, "securityConfidence": nullableFloat(securityConfidence), "detector": detector, "jevRequestId": jevRequest, "promptTokens": prompt, "quotaMicros": quota, "createdAt": created, "canViewText": role != "member" || owner == sess.User.ID})
	}
	writeJSON(w, 200, map[string]any{"workspaceId": wid, "decisions": data})
}

func (s *Server) securityDecision(w http.ResponseWriter, r *http.Request) {
	sess, role, ok := s.consoleAccess(w, r, false)
	if !ok {
		return
	}
	var id, requestID, keyID, text, categories, severity, detector, created, owner string
	var intent, complexity sql.NullString
	var routeConfidence, securityConfidence sql.NullFloat64
	var prompt, quota int64
	err := s.Store.DB.QueryRowContext(r.Context(), `SELECT d.id,d.request_id,d.api_key_id,d.original_text,d.route_intent,d.route_complexity,d.route_confidence,d.security_categories,d.security_severity,d.security_confidence,d.detector,d.prompt_tokens,d.quota_micros,d.created_at,k.owner_user_id FROM jev_decisions d JOIN api_keys k ON k.id=d.api_key_id WHERE d.workspace_id=? AND d.id=? AND d.created_at>=?`, r.PathValue("wid"), r.PathValue("id"), time.Now().UTC().Add(-90*24*time.Hour).Format(time.RFC3339Nano)).Scan(&id, &requestID, &keyID, &text, &intent, &complexity, &routeConfidence, &categories, &severity, &securityConfidence, &detector, &prompt, &quota, &created, &owner)
	if errors.Is(err, sql.ErrNoRows) {
		apiError(w, 404, "not_found", "Decision not found.")
		return
	}
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if role == "member" && owner != sess.User.ID {
		apiError(w, 403, "forbidden", "Decision details require the decision owner or workspace admin.")
		return
	}
	var decoded []string
	_ = json.Unmarshal([]byte(categories), &decoded)
	writeJSON(w, 200, map[string]any{"id": id, "requestId": requestID, "keyId": keyID, "requestText": text, "routeIntent": nullString(intent.String), "routeComplexity": nullString(complexity.String), "routeConfidence": nullableFloat(routeConfidence), "securityCategories": decoded, "securitySeverity": severity, "securityConfidence": nullableFloat(securityConfidence), "detector": detector, "promptTokens": prompt, "quotaMicros": quota, "createdAt": created})
}

func (s *Server) securityIncidents(w http.ResponseWriter, r *http.Request) {
	_, role, ok := s.consoleAccess(w, r, false)
	if !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	query := `SELECT id,request_id,api_key_id,direction,severity,detector,categories,confidence,evidence,status,created_at,resolved_at,resolved_by FROM security_incidents WHERE workspace_id=? AND created_at>=?`
	args := []any{r.PathValue("wid"), time.Now().UTC().Add(-90 * 24 * time.Hour).Format(time.RFC3339Nano)}
	if status != "" {
		query += ` AND status=?`
		args = append(args, status)
	}
	query += ` ORDER BY created_at DESC LIMIT 200`
	rows, err := s.Store.DB.QueryContext(r.Context(), query, args...)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := []map[string]any{}
	for rows.Next() {
		var id, requestID, keyID, direction, severity, detector, categories, evidence, status, created string
		var confidence float64
		var resolvedAt, resolvedBy sql.NullString
		if err := rows.Scan(&id, &requestID, &keyID, &direction, &severity, &detector, &categories, &confidence, &evidence, &status, &created, &resolvedAt, &resolvedBy); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		var cats []string
		_ = json.Unmarshal([]byte(categories), &cats)
		item := map[string]any{"id": id, "requestId": requestID, "keyId": keyID, "direction": direction, "severity": severity, "detector": detector, "categories": cats, "confidence": confidence, "status": status, "createdAt": created, "resolvedAt": scanNullString(resolvedAt), "resolvedBy": scanNullString(resolvedBy)}
		if role != "member" {
			var detail any
			if json.Unmarshal([]byte(evidence), &detail) == nil {
				item["evidence"] = detail
			}
		} else {
			item["evidence"] = nil
		}
		data = append(data, item)
	}
	writeJSON(w, 200, map[string]any{"workspaceId": r.PathValue("wid"), "incidents": data})
}

func (s *Server) securityIncident(w http.ResponseWriter, r *http.Request) {
	_, role, ok := s.consoleAccess(w, r, true)
	if !ok {
		return
	}
	if role != "owner" && role != "admin" {
		apiError(w, 403, "forbidden", "Workspace admin required.")
		return
	}
	var in struct {
		Status   string `json:"status"`
		Severity string `json:"severity"`
	}
	if readJSON(r, &in) != nil || !containsString([]string{"open", "reviewing", "resolved", "false_positive"}, in.Status) || (in.Severity != "" && !containsString([]string{"low", "high", "critical"}, in.Severity)) {
		apiError(w, 400, "invalid_incident", "Invalid incident status or severity.")
		return
	}
	sess, err := s.requireSession(r)
	if err != nil {
		apiError(w, 401, "unauthorized", "Sign in required.")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	resolvedAt, resolvedBy := any(nil), any(nil)
	if in.Status == "resolved" || in.Status == "false_positive" {
		resolvedAt, resolvedBy = now, sess.User.ID
	}
	cutoff := time.Now().UTC().Add(-90 * 24 * time.Hour).Format(time.RFC3339Nano)
	result, err := s.Store.DB.ExecContext(r.Context(), `UPDATE security_incidents SET status=?,severity=COALESCE(NULLIF(?,''),severity),resolved_at=?,resolved_by=? WHERE workspace_id=? AND id=? AND created_at>=?`, in.Status, in.Severity, resolvedAt, resolvedBy, r.PathValue("wid"), r.PathValue("id"), cutoff)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		apiError(w, 404, "not_found", "Incident not found.")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func nullString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func nullableFloat(value sql.NullFloat64) any {
	if !value.Valid {
		return nil
	}
	return value.Float64
}
