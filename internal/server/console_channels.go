package server

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/channel"
	"github.com/tans/capi/internal/provider"
)

func (s *Server) consoleChannels(w http.ResponseWriter, r *http.Request) {
	admin := strings.HasPrefix(r.URL.Path, "/api/admin/channels")
	if admin {
		if r.Method != http.MethodGet && r.Method != http.MethodHead && !s.sameOrigin(r) {
			apiError(w, 403, "bad_origin", "Origin is not allowed.")
			return
		}
		if _, err := s.requireAdmin(r); err != nil {
			apiError(w, 403, "forbidden", "Admin access required.")
			return
		}
	} else {
		if _, _, ok := s.consoleAccess(w, r, r.Method != http.MethodGet); !ok {
			return
		}
	}
	wid := r.PathValue("wid")
	if r.Method == http.MethodGet {
		s.consoleListChannels(w, r, admin)
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
		query, args := `DELETE FROM channels WHERE id=? AND workspace_id=?`, []any{id, wid}
		if admin {
			query, args = `DELETE FROM channels WHERE id=?`, []any{id}
		}
		result, err := s.Store.DB.ExecContext(r.Context(), query, args...)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			apiError(w, 404, "not_found", "Channel not found.")
			return
		}
		s.Router.Clear(id)
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	var fields map[string]json.RawMessage
	if err := readJSON(r, &fields); err != nil {
		apiError(w, 400, "invalid_json", "Invalid channel configuration.")
		return
	}
	in, err := channel.ParseInput(fields)
	if err != nil {
		apiError(w, 400, "invalid_json", "Invalid channel configuration: "+err.Error())
		return
	}
	if id == "" {
		id = in.ID
	}
	ch := provider.Channel{ID: auth.RandomID("chn_"), Protocol: "openai", Enabled: true, Weight: 1, Config: provider.ChannelConfig{Groups: []string{"default"}, MultiKeyMode: "random", SystemOneProtocol: "generic"}}
	if !admin {
		ch.WorkspaceID = &wid
	}
	if r.Method == http.MethodPatch {
		var err error
		ch, err = provider.GetByID(r.Context(), s.Store, id)
		if err != nil || (!admin && (ch.WorkspaceID == nil || *ch.WorkspaceID != wid)) {
			apiError(w, 404, "not_found", "Channel not found.")
			return
		}
		if ch.Protocol == "chatgpt-subscription" && (in.APIKey != nil || in.Keys != nil || in.BaseURL != nil || in.BaseUrl != nil || in.Type != nil || in.Protocol != nil) {
			apiError(w, 400, "subscription_channel", "Import ChatGPT credentials through the subscription endpoint.")
			return
		}
	}
	ch, err = channel.Build(in, ch)
	if err != nil {
		apiError(w, 400, "invalid_status", err.Error())
		return
	}
	if err := channel.Validate(ch); err != nil {
		apiError(w, 400, "invalid_channel", err.Error())
		return
	}
	for _, group := range ch.Config.Groups {
		var enabled int
		if s.Store.DB.QueryRowContext(r.Context(), `SELECT enabled FROM model_groups WHERE name=?`, group).Scan(&enabled) != nil || enabled != 1 {
			apiError(w, 400, "invalid_group", "Select enabled model groups.")
			return
		}
	}
	if len(ch.Models) == 0 {
		found, _, err := provider.DiscoverModelsForChannel(r.Context(), ch)
		if err != nil {
			apiError(w, 400, "model_discovery_failed", err.Error())
			return
		}
		for _, m := range found {
			ch.Models = append(ch.Models, m.ID)
		}
	}
	if r.Method == http.MethodPost {
		if err := provider.Create(r.Context(), s.Store, ch); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		writeJSON(w, 201, channel.Project(ch, ""))
		return
	}
	models, _ := json.Marshal(ch.Models)
	cfg, _ := json.Marshal(ch.Config)
	storedAPIKey := ch.APIKey
	if ch.Protocol == "chatgpt-subscription" {
		encoded, err := provider.EncodeSubscriptionSecret([]byte(ch.APIKey))
		if err != nil {
			apiError(w, 500, "credential_encryption_failed", "Could not protect ChatGPT credentials.")
			return
		}
		storedAPIKey = encoded
	}
	query, args := `UPDATE channels SET name=?,protocol=?,base_url=?,api_key=?,models_json=?,priority=?,weight=?,enabled=?,price_input_micros_per_million=?,price_output_micros_per_million=?,config_json=?,last_error='',auto_disabled_at=NULL,updated_at=? WHERE id=? AND workspace_id=?`, []any{ch.Name, ch.Protocol, ch.BaseURL, storedAPIKey, string(models), ch.Priority, ch.Weight, ch.Enabled, ch.InputMicrosPerMillion, ch.OutputMicrosPerMillion, string(cfg), time.Now().UTC().Format(time.RFC3339Nano), ch.ID, wid}
	if admin {
		query, args = `UPDATE channels SET name=?,protocol=?,base_url=?,api_key=?,models_json=?,priority=?,weight=?,enabled=?,price_input_micros_per_million=?,price_output_micros_per_million=?,config_json=?,last_error='',auto_disabled_at=NULL,updated_at=? WHERE id=?`, []any{ch.Name, ch.Protocol, ch.BaseURL, storedAPIKey, string(models), ch.Priority, ch.Weight, ch.Enabled, ch.InputMicrosPerMillion, ch.OutputMicrosPerMillion, string(cfg), time.Now().UTC().Format(time.RFC3339Nano), ch.ID}
	}
	if _, err := s.Store.DB.ExecContext(r.Context(), query, args...); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	s.Router.Clear(ch.ID)
	writeJSON(w, 200, channel.Project(ch, ""))
}

func (s *Server) consoleListChannels(w http.ResponseWriter, r *http.Request, admin bool) {
	query := `SELECT id,last_error FROM channels WHERE workspace_id=? ORDER BY priority DESC,created_at`
	args := []any{r.PathValue("wid")}
	if admin {
		query = `SELECT id,last_error FROM channels WHERE workspace_id IS NULL ORDER BY priority DESC,created_at`
		args = nil
	}
	rows, err := s.Store.DB.QueryContext(r.Context(), query, args...)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	type item struct{ id, last string }
	items := []item{}
	for rows.Next() {
		var v item
		if err = rows.Scan(&v.id, &v.last); err != nil {
			rows.Close()
			apiError(w, 500, "database_error", err.Error())
			return
		}
		items = append(items, v)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	data := []map[string]any{}
	for _, item := range items {
		ch, err := provider.GetByID(r.Context(), s.Store, item.id)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		projection := channel.Project(ch, item.last)
		if !admin {
			_, role, err := s.requireWorkspaceRole(r, r.PathValue("wid"))
			if err != nil || role == "member" {
				projection["headers"] = map[string]string{}
			}
		}
		data = append(data, projection)
	}
	writeJSON(w, 200, map[string]any{"object": "list", "data": data})
}

func (s *Server) consoleDiscoverModels(w http.ResponseWriter, r *http.Request) {
	admin := strings.HasPrefix(r.URL.Path, "/api/admin/channels")
	if admin {
		if !s.sameOrigin(r) {
			apiError(w, 403, "bad_origin", "Origin is not allowed.")
			return
		}
		if _, err := s.requireAdmin(r); err != nil {
			apiError(w, 403, "forbidden", "Admin access required.")
			return
		}
	} else if _, _, ok := s.consoleAccess(w, r, true); !ok {
		return
	}
	var in struct {
		BaseURL   string            `json:"baseUrl"`
		Keys      []string          `json:"keys"`
		ChannelID string            `json:"channelId"`
		Headers   map[string]string `json:"headers"`
		Protocol  string            `json:"protocol"`
	}
	if readJSON(r, &in) != nil {
		apiError(w, 400, "invalid_json", "Invalid discovery request.")
		return
	}
	ch := provider.Channel{BaseURL: in.BaseURL, Protocol: in.Protocol, Config: provider.ChannelConfig{Headers: in.Headers}}
	if in.ChannelID != "" {
		stored, err := provider.GetByID(r.Context(), s.Store, in.ChannelID)
		if err != nil || (!admin && (stored.WorkspaceID == nil || *stored.WorkspaceID != r.PathValue("wid"))) {
			apiError(w, 404, "not_found", "Channel not found.")
			return
		}
		ch.APIKey = stored.APIKey
		ch.Protocol = stored.Protocol
		if in.Headers == nil {
			ch.Config.Headers = stored.Config.Headers
		}
	}
	if len(in.Keys) > 0 {
		ch.APIKey = in.Keys[0]
	}
	if ch.Protocol == "" {
		ch.Protocol = "openai"
	}
	u, err := url.Parse(ch.BaseURL)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil {
		apiError(w, 400, "invalid_url", "Use an HTTP(S) base URL.")
		return
	}
	models, _, err := provider.DiscoverModelsForChannel(r.Context(), ch)
	if err != nil {
		apiError(w, 400, "model_discovery_failed", err.Error())
		return
	}
	ids := []string{}
	for _, model := range models {
		ids = append(ids, model.ID)
	}
	writeJSON(w, 200, map[string]any{"data": ids})
}

func (s *Server) consoleDetectChannel(w http.ResponseWriter, r *http.Request) {
	admin := strings.HasPrefix(r.URL.Path, "/api/admin/channels")
	if r.Method != http.MethodGet && !s.sameOrigin(r) {
		apiError(w, 403, "bad_origin", "Origin is not allowed.")
		return
	}
	if admin {
		if _, err := s.requireAdmin(r); err != nil {
			apiError(w, 403, "forbidden", "Admin access required.")
			return
		}
	} else if _, _, ok := s.consoleAccess(w, r, true); !ok {
		return
	}
	var in struct {
		BaseURL   string            `json:"baseUrl"`
		Key       string            `json:"key"`
		Keys      []string          `json:"keys"`
		ChannelID string            `json:"channelId"`
		Headers   map[string]string `json:"headers"`
		Model     string            `json:"model"`
		Protocol  string            `json:"protocol"`
	}
	if readJSON(r, &in) != nil {
		apiError(w, 400, "invalid_json", "Invalid detection request.")
		return
	}
	ch := provider.Channel{BaseURL: in.BaseURL, APIKey: strings.TrimSpace(in.Key), Config: provider.ChannelConfig{Headers: in.Headers}}
	if in.ChannelID != "" {
		stored, err := provider.GetByID(r.Context(), s.Store, in.ChannelID)
		if err != nil || (!admin && (stored.WorkspaceID == nil || *stored.WorkspaceID != r.PathValue("wid"))) {
			apiError(w, 404, "not_found", "Channel not found.")
			return
		}
		ch = stored
	}
	if len(in.Keys) > 0 {
		ch.APIKey = strings.TrimSpace(in.Keys[0])
	}
	if ch.APIKey == "" {
		apiError(w, 400, "missing_key", "An upstream API key is required for detection.")
		return
	}
	if strings.TrimSpace(ch.BaseURL) == "" {
		apiError(w, 400, "missing_base_url", "An upstream base URL is required for detection.")
		return
	}
	if protocol := strings.TrimSpace(in.Protocol); protocol != "" {
		if !provider.DetectProtocolSupported(protocol) {
			apiError(w, 400, "unsupported_protocol", "Protocol must be openai, responses, anthropic or gemini.")
			return
		}
		writeJSON(w, 200, map[string]any{"data": []provider.Detection{provider.DetectOne(r.Context(), ch, ch.BaseURL, in.Model, protocol)}})
		return
	}
	writeJSON(w, 200, map[string]any{"data": provider.Detect(r.Context(), ch, ch.BaseURL, in.Model)})
}
