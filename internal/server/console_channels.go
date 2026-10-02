package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/provider"
)

type channelInput struct {
	provider.ChannelConfig
	ID          string    `json:"id"`
	Name        *string   `json:"name"`
	Protocol    *string   `json:"protocol"`
	Type        *string   `json:"type"`
	BaseURL     *string   `json:"base_url"`
	BaseUrl     *string   `json:"baseUrl"`
	APIKey      *string   `json:"api_key"`
	Models      *[]string `json:"models"`
	Priority    *int      `json:"priority"`
	Weight      *int      `json:"weight"`
	Enabled     *bool     `json:"enabled"`
	Status      *int      `json:"status"`
	InputPrice  *int64    `json:"price_input_micros_per_million"`
	OutputPrice *int64    `json:"price_output_micros_per_million"`
}

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
	encoded, _ := json.Marshal(fields)
	var in channelInput
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&in); err != nil {
		apiError(w, 400, "invalid_json", "Invalid channel configuration: "+err.Error())
		return
	}
	if id == "" {
		id = in.ID
	}
	ch := provider.Channel{ID: auth.RandomID("chn_"), Protocol: "openai", Enabled: true, Weight: 1, Config: provider.ChannelConfig{Groups: []string{"default"}, MultiKeyMode: "random", EvaluateProtocol: "generic"}}
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
	if in.Name != nil {
		ch.Name = strings.TrimSpace(*in.Name)
	}
	if in.Protocol != nil {
		ch.Protocol = *in.Protocol
	}
	if in.Type != nil {
		ch.Protocol = *in.Type
	}
	if ch.Protocol == "openai-compatible" {
		ch.Protocol = "openai"
	}
	if in.BaseURL != nil {
		ch.BaseURL = strings.TrimSpace(*in.BaseURL)
	}
	if in.BaseUrl != nil {
		ch.BaseURL = strings.TrimSpace(*in.BaseUrl)
	}
	if in.Models != nil {
		ch.Models = uniqueStrings(*in.Models)
	}
	if in.Priority != nil {
		ch.Priority = *in.Priority
	}
	if in.Weight != nil {
		ch.Weight = *in.Weight
	}
	if ch.Weight == 0 {
		ch.Weight = 1
	}
	if in.Enabled != nil {
		ch.Enabled = *in.Enabled
	}
	if in.Status != nil {
		if *in.Status != 1 && *in.Status != 3 {
			apiError(w, 400, "invalid_status", "Use enabled (1) or disabled (3).")
			return
		}
		ch.Enabled = *in.Status == 1
	}
	if in.APIKey != nil {
		ch.APIKey = strings.TrimSpace(*in.APIKey)
		ch.Config.Keys = []string{ch.APIKey}
	}
	if in.Keys != nil {
		ch.Config.Keys = uniqueStrings(in.Keys)
		if len(ch.Config.Keys) > 0 {
			ch.APIKey = ch.Config.Keys[0]
		}
	}
	if in.Groups == nil && len(ch.Config.Groups) == 0 {
		ch.Config.Groups = []string{"default"}
	}
	if in.Groups != nil {
		ch.Config.Groups = uniqueStrings(in.Groups)
	}
	if in.MultiKeyMode != "" {
		ch.Config.MultiKeyMode = in.MultiKeyMode
	}
	if in.AutoBan != nil {
		ch.Config.AutoBan = in.AutoBan
	}
	if in.ModelMapping != nil {
		ch.Config.ModelMapping = in.ModelMapping
	}
	if in.Headers != nil {
		ch.Config.Headers = in.Headers
	}
	if in.ParamOverride != nil {
		ch.Config.ParamOverride = in.ParamOverride
	}
	if _, ok := fields["tag"]; ok {
		ch.Config.Tag = in.Tag
	}
	if _, ok := fields["videoSubmitPath"]; ok {
		ch.Config.VideoSubmitPath = in.VideoSubmitPath
	}
	if _, ok := fields["videoStatusPath"]; ok {
		ch.Config.VideoStatusPath = in.VideoStatusPath
	}
	if _, ok := fields["evaluatePath"]; ok {
		ch.Config.EvaluatePath = in.EvaluatePath
	}
	if _, ok := fields["evaluateProtocol"]; ok {
		ch.Config.EvaluateProtocol = in.EvaluateProtocol
	}
	if len(in.ImageProtocolConfig) > 0 {
		ch.Config.ImageProtocolConfig = in.ImageProtocolConfig
	}
	if len(in.VideoProtocolConfig) > 0 {
		ch.Config.VideoProtocolConfig = in.VideoProtocolConfig
	}
	if in.InputPrice != nil {
		ch.InputMicrosPerMillion = *in.InputPrice
	}
	if in.OutputPrice != nil {
		ch.OutputMicrosPerMillion = *in.OutputPrice
	}
	if ch.Config.EvaluateProtocol == "" {
		ch.Config.EvaluateProtocol = "generic"
	}
	if err := validateChannel(ch); err != nil {
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
		writeJSON(w, 201, channelProjection(ch, ""))
		return
	}
	models, _ := json.Marshal(ch.Models)
	cfg, _ := json.Marshal(ch.Config)
	query, args := `UPDATE channels SET name=?,protocol=?,base_url=?,api_key=?,models_json=?,priority=?,weight=?,enabled=?,price_input_micros_per_million=?,price_output_micros_per_million=?,config_json=?,last_error='',auto_disabled_at=NULL,updated_at=? WHERE id=? AND workspace_id=?`, []any{ch.Name, ch.Protocol, ch.BaseURL, ch.APIKey, string(models), ch.Priority, ch.Weight, ch.Enabled, ch.InputMicrosPerMillion, ch.OutputMicrosPerMillion, string(cfg), time.Now().UTC().Format(time.RFC3339Nano), ch.ID, wid}
	if admin {
		query, args = `UPDATE channels SET name=?,protocol=?,base_url=?,api_key=?,models_json=?,priority=?,weight=?,enabled=?,price_input_micros_per_million=?,price_output_micros_per_million=?,config_json=?,last_error='',auto_disabled_at=NULL,updated_at=? WHERE id=?`, []any{ch.Name, ch.Protocol, ch.BaseURL, ch.APIKey, string(models), ch.Priority, ch.Weight, ch.Enabled, ch.InputMicrosPerMillion, ch.OutputMicrosPerMillion, string(cfg), time.Now().UTC().Format(time.RFC3339Nano), ch.ID}
	}
	_, err := s.Store.DB.ExecContext(r.Context(), query, args...)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	s.Router.Clear(ch.ID)
	writeJSON(w, 200, channelProjection(ch, ""))
}

func validateChannel(ch provider.Channel) error {
	if ch.Name == "" || len(ch.Name) > 100 {
		return fmt.Errorf("use a channel name of 1–100 characters")
	}
	u, err := url.Parse(ch.BaseURL)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return fmt.Errorf("base URL must be an HTTP(S) URL without credentials, query or fragment")
	}
	switch ch.Protocol {
	case "openai", "anthropic", "gemini", "chatgpt-subscription":
	default:
		return fmt.Errorf("unsupported protocol %q", ch.Protocol)
	}
	if ch.InputMicrosPerMillion < 0 || ch.OutputMicrosPerMillion < 0 {
		return fmt.Errorf("prices cannot be negative")
	}
	if ch.Weight < 1 || ch.Weight > 1000000 || ch.Priority < -1000000 || ch.Priority > 1000000 {
		return fmt.Errorf("priority or weight is out of range")
	}
	if len(ch.Config.Groups) == 0 {
		return fmt.Errorf("select at least one model group")
	}
	if ch.Config.MultiKeyMode != "random" && ch.Config.MultiKeyMode != "polling" {
		return fmt.Errorf("use random or polling key selection")
	}
	for name, value := range ch.Config.Headers {
		if name == "" || strings.ContainsAny(name, " \t\r\n:") || strings.ContainsAny(value, "\r\n") {
			return fmt.Errorf("invalid custom header")
		}
		switch strings.ToLower(name) {
		case "host", "connection", "content-length", "transfer-encoding", "cookie", "set-cookie", "proxy-authorization", "upgrade":
			return fmt.Errorf("header %q cannot be overridden", name)
		}
	}
	for from, to := range ch.Config.ModelMapping {
		if strings.TrimSpace(from) == "" || strings.TrimSpace(to) == "" {
			return fmt.Errorf("model mappings require both names")
		}
	}
	for protocol, base := range ch.Config.ProtocolBases {
		u, err := url.Parse(strings.TrimSpace(base))
		if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return fmt.Errorf("protocol base %q must be an HTTP(S) URL without credentials, query or fragment", protocol)
		}
	}
	for model, protocol := range ch.Config.ModelProtocols {
		if !providerModel(ch.Models, model) {
			return fmt.Errorf("model protocol mapping refers to unknown model %q", model)
		}
		if protocol != "openai" && protocol != "responses" && protocol != "anthropic" && protocol != "gemini" {
			return fmt.Errorf("unsupported model protocol %q", protocol)
		}
		if ch.Config.BaseFor(protocol, "") == "" && protocol != ch.Protocol {
			return fmt.Errorf("model %q has no base URL for protocol %q", model, protocol)
		}
	}
	for name := range ch.Config.ParamOverride {
		if name == "model" || name == "stream" {
			return fmt.Errorf("use model mappings rather than overriding %q", name)
		}
	}
	if !provider.ValidEndpoint(ch.Config.VideoSubmitPath, false) || !provider.ValidEndpoint(ch.Config.VideoStatusPath, true) || !provider.ValidEndpoint(ch.Config.EvaluatePath, false) {
		return fmt.Errorf("custom endpoints must be relative paths")
	}
	if ch.Config.EvaluateProtocol != "generic" && ch.Config.EvaluateProtocol != "typesafe" {
		return fmt.Errorf("unsupported evaluation protocol")
	}
	// Declarative protocol adapters are validated by the execution layer.
	if err := provider.ValidateProtocolConfig(ch.Config); err != nil {
		return err
	}
	return nil
}

func providerModel(models []string, model string) bool {
	for _, candidate := range models {
		if candidate == model || candidate == "*" || (strings.HasSuffix(candidate, "/*") && strings.HasPrefix(model, strings.TrimSuffix(candidate, "*"))) {
			return true
		}
	}
	return false
}

func uniqueStrings(values []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && !seen[value] {
			out = append(out, value)
			seen[value] = true
		}
	}
	return out
}

func channelProjection(ch provider.Channel, lastError string) map[string]any {
	status := 3
	if ch.Enabled {
		status = 1
	} else if lastError != "" {
		status = 2
	}
	keys := len(ch.Config.Keys)
	if keys == 0 && ch.APIKey != "" {
		keys = 1
	}
	groups := ch.Config.Groups
	if len(groups) == 0 {
		groups = []string{"default"}
	}
	return map[string]any{"id": ch.ID, "name": ch.Name, "type": ch.Protocol, "protocol": ch.Protocol, "baseUrl": ch.BaseURL, "base_url": ch.BaseURL, "models": ch.Models, "groups": groups, "priority": ch.Priority, "weight": ch.Weight, "enabled": ch.Enabled, "status": status, "autoBan": ch.Config.AutomaticDisable(), "multiKeyMode": ch.Config.MultiKeyMode, "modelMapping": orEmptyMap(ch.Config.ModelMapping), "protocolBases": orEmptyMap(ch.Config.ProtocolBases), "modelProtocols": orEmptyMap(ch.Config.ModelProtocols), "headers": orEmptyMap(ch.Config.Headers), "paramOverride": orEmptyMap(ch.Config.ParamOverride), "tag": ch.Config.Tag, "videoSubmitPath": ch.Config.VideoSubmitPath, "videoStatusPath": ch.Config.VideoStatusPath, "evaluatePath": ch.Config.EvaluatePath, "evaluateProtocol": ch.Config.EvaluateProtocol, "imageProtocolConfig": rawOrNull(ch.Config.ImageProtocolConfig), "videoProtocolConfig": rawOrNull(ch.Config.VideoProtocolConfig), "keyCount": keys, "lastError": lastError}
}
func orEmptyMap[T any](v map[string]T) map[string]T {
	if v == nil {
		return map[string]T{}
	}
	return v
}
func rawOrNull(v json.RawMessage) any {
	if len(v) == 0 {
		return nil
	}
	return v
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
		projection := channelProjection(ch, item.last)
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
	writeJSON(w, 200, map[string]any{"data": provider.Detect(r.Context(), ch, ch.BaseURL, in.Model)})
}
