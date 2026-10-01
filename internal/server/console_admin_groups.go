package server

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/tans/capi/internal/provider"
)

type adminGroup struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	DisplayName string  `json:"displayName"`
	Ratio       float64 `json:"ratio"`
	Description string  `json:"description"`
	Status      int     `json:"status"`
	CreatedAt   int64   `json:"createdAt"`
}

func validAdminGroupName(name string) bool {
	if name == "" || utf8.RuneCountInString(name) > 32 || name == "." || name == ".." {
		return false
	}
	for _, r := range name {
		if !(unicode.IsLetter(r) || unicode.IsNumber(r) || r == '_' || r == '-' || r == '.') {
			return false
		}
	}
	return true
}

func (s *Server) consoleAdminGroups(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && !s.sameOrigin(r) {
		apiError(w, 403, "bad_origin", "Origin is not allowed.")
		return
	}
	if _, err := s.requireAdmin(r); err != nil {
		apiError(w, 403, "forbidden", "Admin required.")
		return
	}
	if r.Method == http.MethodGet && r.PathValue("id") == "" {
		rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT name,display_name,ratio,description,enabled,created_at FROM model_groups ORDER BY name`)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		defer rows.Close()
		groups := make([]adminGroup, 0)
		for rows.Next() {
			var g adminGroup
			var enabled int
			var created string
			if err := rows.Scan(&g.Name, &g.DisplayName, &g.Ratio, &g.Description, &enabled, &created); err != nil {
				apiError(w, 500, "database_error", err.Error())
				return
			}
			g.ID = g.Name
			g.Status = 2
			if enabled == 1 {
				g.Status = 1
			}
			g.CreatedAt = parseTimeMillis(created)
			groups = append(groups, g)
		}
		if err := rows.Err(); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		writeJSON(w, 200, map[string]any{"data": groups})
		return
	}
	if r.Method == http.MethodPost && r.PathValue("id") == "" {
		in, ok := readAdminGroup(w, r)
		if !ok {
			return
		}
		name, err := normalizeAdminGroup(in.Name, in.DisplayName, in.Description, in.Ratio, in.Status)
		if err != nil {
			apiError(w, 400, "invalid_group", err.Error())
			return
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		_, err = s.Store.DB.ExecContext(r.Context(), `INSERT INTO model_groups(name,display_name,enabled,models_json,ratio,description,created_at) VALUES(?,?,?,?,?,?,?)`, name, in.DisplayName, boolForGroupStatus(in.Status), `[]`, in.Ratio, in.Description, now)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				apiError(w, 409, "group_exists", "A group with this name already exists.")
				return
			}
			apiError(w, 500, "database_error", err.Error())
			return
		}
		writeJSON(w, 201, adminGroup{ID: name, Name: name, DisplayName: in.DisplayName, Ratio: in.Ratio, Description: in.Description, Status: in.Status, CreatedAt: time.Now().UnixMilli()})
		return
	}
	name := strings.ToLower(strings.TrimSpace(r.PathValue("id")))
	if r.Method == http.MethodPatch {
		var in struct {
			Name        *string  `json:"name"`
			DisplayName *string  `json:"displayName"`
			Ratio       *float64 `json:"ratio"`
			Description *string  `json:"description"`
			Status      *int     `json:"status"`
		}
		if readJSON(r, &in) != nil {
			apiError(w, 400, "invalid_group", "Invalid group configuration.")
			return
		}
		var current adminGroup
		var enabled int
		var createdAt string
		if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT name,display_name,ratio,description,enabled,created_at FROM model_groups WHERE name=?`, name).Scan(&current.Name, &current.DisplayName, &current.Ratio, &current.Description, &enabled, &createdAt); err != nil {
			apiError(w, 404, "not_found", "Group not found.")
			return
		}
		if in.Name != nil && strings.ToLower(strings.TrimSpace(*in.Name)) != name {
			apiError(w, 400, "immutable_group_name", "Group names cannot be changed after creation.")
			return
		}
		if in.DisplayName != nil {
			current.DisplayName = strings.TrimSpace(*in.DisplayName)
		}
		if in.Ratio != nil {
			current.Ratio = *in.Ratio
		}
		if in.Description != nil {
			current.Description = strings.TrimSpace(*in.Description)
		}
		current.Status = 2
		if enabled == 1 {
			current.Status = 1
		}
		if in.Status != nil {
			current.Status = *in.Status
		}
		if _, err := normalizeAdminGroup(name, current.DisplayName, current.Description, current.Ratio, current.Status); err != nil {
			apiError(w, 400, "invalid_group", err.Error())
			return
		}
		_, err := s.Store.DB.ExecContext(r.Context(), `UPDATE model_groups SET display_name=?,ratio=?,description=?,enabled=? WHERE name=?`, current.DisplayName, current.Ratio, current.Description, boolForGroupStatus(current.Status), name)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		current.ID = name
		current.CreatedAt = parseTimeMillis(createdAt)
		writeJSON(w, 200, current)
		return
	}
	if r.Method == http.MethodDelete {
		if name == "default" {
			apiError(w, 409, "protected_group", "The default group cannot be deleted.")
			return
		}
		tx, err := s.Store.DB.BeginTx(r.Context(), nil)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		defer tx.Rollback()
		var exists int
		if err := tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM model_groups WHERE name=?`, name).Scan(&exists); err != nil || exists == 0 {
			apiError(w, 404, "not_found", "Group not found.")
			return
		}
		rows, err := tx.QueryContext(r.Context(), `SELECT id,config_json FROM channels`)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		for rows.Next() {
			var id, configJSON string
			if err := rows.Scan(&id, &configJSON); err != nil {
				rows.Close()
				apiError(w, 500, "database_error", err.Error())
				return
			}
			cfg, err := provider.DecodeChannelConfig(configJSON)
			if err != nil {
				rows.Close()
				apiError(w, 500, "invalid_channel_config", err.Error())
				return
			}
			filtered := cfg.Groups[:0]
			for _, group := range cfg.Groups {
				if group != name {
					filtered = append(filtered, group)
				}
			}
			if len(filtered) != len(cfg.Groups) {
				cfg.Groups = filtered
				encoded, _ := json.Marshal(cfg)
				if _, err := tx.ExecContext(r.Context(), `UPDATE channels SET config_json=?,updated_at=? WHERE id=?`, string(encoded), time.Now().UTC().Format(time.RFC3339Nano), id); err != nil {
					rows.Close()
					apiError(w, 500, "database_error", err.Error())
					return
				}
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			apiError(w, 500, "database_error", err.Error())
			return
		}
		rows.Close()
		if _, err := tx.ExecContext(r.Context(), `UPDATE api_keys SET group_name='default' WHERE group_name=?`, name); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		if _, err := tx.ExecContext(r.Context(), `DELETE FROM model_groups WHERE name=?`, name); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		if err := tx.Commit(); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	apiError(w, 405, "method_not_allowed", "Unsupported group operation.")
}

type groupInput struct {
	Name        string  `json:"name"`
	DisplayName string  `json:"displayName"`
	Ratio       float64 `json:"ratio"`
	Description string  `json:"description"`
	Status      int     `json:"status"`
}

func readAdminGroup(w http.ResponseWriter, r *http.Request) (groupInput, bool) {
	var in groupInput
	if readJSON(r, &in) != nil {
		apiError(w, 400, "invalid_group", "Invalid group configuration.")
		return in, false
	}
	in.Name = strings.ToLower(strings.TrimSpace(in.Name))
	in.DisplayName = strings.TrimSpace(in.DisplayName)
	in.Description = strings.TrimSpace(in.Description)
	if in.DisplayName == "" {
		in.DisplayName = in.Name
	}
	if in.Status == 0 {
		in.Status = 1
	}
	if _, err := normalizeAdminGroup(in.Name, in.DisplayName, in.Description, in.Ratio, in.Status); err != nil {
		apiError(w, 400, "invalid_group", err.Error())
		return in, false
	}
	return in, true
}

func normalizeAdminGroup(name, displayName, description string, ratio float64, status int) (string, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if !validAdminGroupName(name) || utf8.RuneCountInString(strings.TrimSpace(displayName)) < 1 || utf8.RuneCountInString(strings.TrimSpace(displayName)) > 100 || utf8.RuneCountInString(strings.TrimSpace(description)) > 200 || math.IsNaN(ratio) || math.IsInf(ratio, 0) || ratio < 0 || ratio > 1000 || status != 1 && status != 2 {
		return "", errors.New("use a 1–32 character group name, a display name up to 100 characters, a ratio from 0 to 1000, a description up to 200 characters, and an enabled or disabled status")
	}
	return name, nil
}

func boolForGroupStatus(status int) int {
	if status == 1 {
		return 1
	}
	return 0
}
