package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

// workspaceAPI exposes non-model workspace data behind its own scope.
func (s *Server) workspaceAPI(w http.ResponseWriter, r *http.Request) {
	k, err := s.authenticateAPI(r, "workspace.manage")
	if err != nil {
		apiError(w, http.StatusUnauthorized, "unauthorized", err.Error())
		return
	}
	switch r.PathValue("resource") {
	case "requests":
		s.workspaceRequests(w, r, k.WorkspaceID)
	case "tasks":
		if r.PathValue("id") == "" {
			s.workspaceTasks(w, r, k.WorkspaceID)
			return
		}
		s.workspaceTask(w, r, k.WorkspaceID, r.PathValue("id"))
	case "balance":
		s.writeBalance(w, r, k.WorkspaceID)
	default:
		apiError(w, http.StatusNotFound, "not_found", "Workspace resource not found.")
	}
}

func (s *Server) workspaceRequests(w http.ResponseWriter, r *http.Request, wid string) {
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT id,requested_model,routed_model,endpoint,status,cost_micros,created_at FROM usage_records WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100`, wid)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := []map[string]any{}
	for rows.Next() {
		var id, requested, routed, endpoint, created string
		var status int
		var cost int64
		if err := rows.Scan(&id, &requested, &routed, &endpoint, &status, &cost, &created); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		data = append(data, map[string]any{"id": id, "requested_model": requested, "routed_model": routed, "endpoint": endpoint, "status": status, "cost_micros": cost, "created_at": created})
	}
	writeJSON(w, 200, map[string]any{"data": data})
}

func (s *Server) workspaceTasks(w http.ResponseWriter, r *http.Request, wid string) {
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT id,model,status,prompt,reference_file_ids,error,created_at,updated_at FROM video_tasks WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100`, wid)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := []map[string]any{}
	for rows.Next() {
		var id, model, status, prompt, references, taskError, created, updated string
		if err := rows.Scan(&id, &model, &status, &prompt, &references, &taskError, &created, &updated); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		var ids []string
		_ = json.Unmarshal([]byte(references), &ids)
		data = append(data, map[string]any{"id": id, "model": model, "status": status, "prompt": prompt, "reference_file_ids": ids, "error": taskError, "created_at": created, "updated_at": updated})
	}
	writeJSON(w, 200, map[string]any{"data": data})
}

func (s *Server) workspaceTask(w http.ResponseWriter, r *http.Request, wid, id string) {
	var model, status, prompt, references, taskError, created, updated string
	var result sql.NullString
	err := s.Store.DB.QueryRowContext(r.Context(), `SELECT model,status,prompt,reference_file_ids,error,result_json,created_at,updated_at FROM video_tasks WHERE id=? AND workspace_id=?`, id, wid).Scan(&model, &status, &prompt, &references, &taskError, &result, &created, &updated)
	if err == sql.ErrNoRows {
		apiError(w, 404, "task_not_found", "Task not found.")
		return
	}
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	var ids []string
	_ = json.Unmarshal([]byte(references), &ids)
	var payload any
	_ = json.Unmarshal([]byte(result.String), &payload)
	writeJSON(w, 200, map[string]any{"id": id, "model": model, "status": status, "prompt": prompt, "reference_file_ids": ids, "error": taskError, "result": payload, "created_at": created, "updated_at": updated})
}
