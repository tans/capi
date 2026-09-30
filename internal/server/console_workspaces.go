package server

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/provider"
)

func (s *Server) consoleWorkspace(w http.ResponseWriter, r *http.Request) {
	_, role, ok := s.consoleAccess(w, r, r.Method != http.MethodGet)
	if !ok {
		return
	}
	wid := r.PathValue("wid")
	if r.Method == http.MethodPatch {
		var in struct {
			Name  *string `json:"name"`
			Allow *bool   `json:"allowPlatformChannels"`
		}
		if readJSON(r, &in) != nil {
			apiError(w, 400, "invalid_json", "Invalid workspace settings.")
			return
		}
		if in.Name != nil {
			name := strings.TrimSpace(*in.Name)
			if name == "" || len(name) > 100 {
				apiError(w, 400, "invalid_name", "Use a workspace name of 1–100 characters.")
				return
			}
			if _, err := s.Store.DB.ExecContext(r.Context(), `UPDATE workspaces SET name=? WHERE id=?`, name, wid); err != nil {
				apiError(w, 500, "database_error", err.Error())
				return
			}
		}
		if in.Allow != nil {
			if _, err := s.Store.DB.ExecContext(r.Context(), `UPDATE workspaces SET allow_platform_channels=? WHERE id=?`, *in.Allow, wid); err != nil {
				apiError(w, 500, "database_error", err.Error())
				return
			}
		}
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	var name, kind, settings string
	var allow int
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT name,kind,allow_platform_channels,settings_json FROM workspaces WHERE id=?`, wid).Scan(&name, &kind, &allow, &settings); err != nil {
		apiError(w, 404, "not_found", "Workspace not found.")
		return
	}
	groups := []map[string]any{}
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT name,display_name FROM model_groups WHERE enabled=1 ORDER BY name`)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	for rows.Next() {
		var n, d string
		if rows.Scan(&n, &d) == nil {
			groups = append(groups, map[string]any{"name": n, "displayName": d})
		}
	}
	rows.Close()
	var balance int64
	var currency string
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT balance_micros,currency FROM wallets WHERE workspace_id=?`, wid).Scan(&balance, &currency); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	models, err := provider.ListModels(r.Context(), s.Store, wid)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if models == nil {
		models = []string{}
	}
	platformModels := []string{}
	platformChannels, err := provider.Accessible(r.Context(), s.Store, wid, "")
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	seen := map[string]bool{}
	for _, ch := range platformChannels {
		if ch.WorkspaceID != nil {
			continue
		}
		for _, model := range ch.Models {
			if !seen[model] {
				seen[model] = true
				platformModels = append(platformModels, model)
			}
		}
	}
	var cfg map[string]any
	_ = json.Unmarshal([]byte(settings), &cfg)
	writeJSON(w, 200, map[string]any{"workspace": map[string]any{"id": wid, "name": name, "kind": kind, "role": role, "allowPlatformChannels": allow == 1, "settings": cfg}, "groups": groups, "currency": map[string]any{"code": currency, "symbol": "$", "rate": 1}, "balance_micros": balance, "models": models, "platformModels": platformModels})
}

func (s *Server) consoleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	if !s.sameOrigin(r) {
		apiError(w, 403, "bad_origin", "Origin is not allowed.")
		return
	}
	sess, err := s.requireSession(r)
	if err != nil {
		apiError(w, 401, "unauthorized", "Sign in required.")
		return
	}
	var in struct {
		Name string `json:"name"`
		Kind string `json:"kind"`
	}
	if readJSON(r, &in) != nil {
		apiError(w, 400, "invalid_json", "Invalid workspace.")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 100 {
		apiError(w, 400, "invalid_name", "Use a name of 1–100 characters.")
		return
	}
	if in.Kind == "" {
		in.Kind = "team"
	}
	if in.Kind != "team" && in.Kind != "personal" {
		apiError(w, 400, "invalid_kind", "Use team or personal.")
		return
	}
	id := auth.RandomID("ws_")
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := s.Store.DB.BeginTx(r.Context(), nil)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO workspaces(id,name,kind,created_at) VALUES(?,?,?,?)`, id, in.Name, in.Kind, now); err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?)`, id, sess.User.ID, "owner", now)
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO wallets(workspace_id,balance_micros,currency,updated_at) VALUES(?,?,?,?)`, id, 0, "USD", now)
	}
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if err = tx.Commit(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 201, map[string]any{"id": id, "name": in.Name, "kind": in.Kind, "role": "owner"})
}
