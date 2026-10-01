package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	"github.com/tans/capi/internal/provider"
)

type adminAbility struct {
	Group     string `json:"group"`
	Model     string `json:"model"`
	ChannelID string `json:"channelId"`
	Enabled   bool   `json:"enabled"`
	Priority  int    `json:"priority"`
	Weight    int    `json:"weight"`
	Tag       string `json:"tag,omitempty"`
}

type adminAbilityChannel struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Weight int     `json:"weight"`
	Share  float64 `json:"share"`
}

func (s *Server) consoleAdminAbilities(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		apiError(w, 403, "forbidden", "Admin required.")
		return
	}
	group, model := r.URL.Query().Get("group"), r.URL.Query().Get("model")
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT id,name,models_json,priority,weight,enabled,config_json FROM channels ORDER BY priority DESC,created_at ASC`)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	abilities := make([]adminAbility, 0)
	type routeChannel struct {
		id, name string
		weight   int
	}
	layers := map[int][]routeChannel{}
	for rows.Next() {
		var id, name, modelsJSON, configJSON string
		var priority, weight, enabled int
		if err := rows.Scan(&id, &name, &modelsJSON, &priority, &weight, &enabled, &configJSON); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		var models []string
		if err := json.Unmarshal([]byte(modelsJSON), &models); err != nil {
			continue
		}
		cfg, err := provider.DecodeChannelConfig(configJSON)
		if err != nil {
			continue
		}
		groups := cfg.Groups
		if len(groups) == 0 {
			groups = []string{"default"}
		}
		if group != "" && model != "" {
			if adminContainsString(groups, group) && adminChannelServesModel(models, model) && enabled == 1 {
				layers[priority] = append(layers[priority], routeChannel{id: id, name: name, weight: weight})
			}
			continue
		}
		for _, g := range groups {
			for _, m := range models {
				if g == "" || m == "" {
					continue
				}
				if group != "" && g != group {
					continue
				}
				if model != "" && m != model {
					continue
				}
				abilities = append(abilities, adminAbility{Group: g, Model: m, ChannelID: id, Enabled: enabled == 1, Priority: priority, Weight: weight, Tag: cfg.Tag})
			}
		}
	}
	if err := rows.Err(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if group == "" || model == "" {
		writeJSON(w, 200, map[string]any{"data": abilities})
		return
	}
	priorities := make([]int, 0, len(layers))
	for priority := range layers {
		priorities = append(priorities, priority)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(priorities)))
	resultLayers := make([]map[string]any, 0, len(priorities))
	for _, priority := range priorities {
		channels := layers[priority]
		total := 0
		for _, channel := range channels {
			if channel.weight > 0 {
				total += channel.weight
			}
		}
		out := make([]adminAbilityChannel, 0, len(channels))
		for index, channel := range channels {
			share := float64(0)
			if total > 0 && channel.weight > 0 {
				share = float64(channel.weight) / float64(total)
			} else if total == 0 && index == 0 {
				share = 1
			}
			out = append(out, adminAbilityChannel{ID: channel.id, Name: channel.name, Weight: channel.weight, Share: share})
		}
		resultLayers = append(resultLayers, map[string]any{"priority": priority, "channels": out})
	}
	writeJSON(w, 200, map[string]any{"group": group, "model": model, "layers": resultLayers})
}

func adminChannelServesModel(models []string, requested string) bool {
	for _, model := range models {
		if model == "*" || model == requested || strings.HasSuffix(model, "/*") && strings.HasPrefix(requested, strings.TrimSuffix(model, "*")) {
			return true
		}
	}
	return false
}

func adminContainsString(values []string, requested string) bool {
	for _, value := range values {
		if value == requested {
			return true
		}
	}
	return false
}

func (s *Server) consoleAdminChannels(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		apiError(w, 403, "forbidden", "Admin required.")
		return
	}
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT id,last_error,workspace_id FROM channels ORDER BY priority DESC,created_at ASC`)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	type row struct {
		id, lastError string
		workspaceID   sql.NullString
	}
	items := make([]row, 0)
	for rows.Next() {
		var item row
		if err := rows.Scan(&item.id, &item.lastError, &item.workspaceID); err != nil {
			rows.Close()
			apiError(w, 500, "database_error", err.Error())
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		apiError(w, 500, "database_error", err.Error())
		return
	}
	rows.Close()
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		channel, err := provider.GetByID(r.Context(), s.Store, item.id)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		projection := channelProjection(channel, item.lastError)
		if !item.workspaceID.Valid {
			projection["ownerType"] = "platform"
		} else {
			projection["ownerType"] = "workspace"
			var name string
			if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT name FROM workspaces WHERE id=?`, item.workspaceID.String).Scan(&name); err == nil {
				projection["workspaceName"] = name
			}
		}
		out = append(out, projection)
	}
	writeJSON(w, 200, map[string]any{"data": out})
}
