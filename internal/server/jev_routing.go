package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/tans/capi/internal/provider"
)

const defaultJevAlias = "capi-auto"

var errAutoRoutingDisabled = errors.New("automatic routing is not enabled for this workspace")
var errAutoRouteUnavailable = errors.New("no available model for the automatic route")

var defaultJevProfiles = map[string]map[string]string{
	"chat":      {"light": "gpt-4o-mini", "standard": "gpt-4o", "advanced": "gpt-5.5"},
	"code":      {"light": "gpt-4o-mini", "standard": "gpt-5.5", "advanced": "gpt-5.5"},
	"analysis":  {"light": "gpt-4o-mini", "standard": "gpt-4o", "advanced": "gpt-5.5"},
	"sensitive": {"standard": "gpt-5.5"},
	"media":     {"standard": "gpt-4o"},
	"other":     {"standard": "gpt-4o"},
}

type jevRouteConfig struct {
	Alias    string                       `json:"alias"`
	Profiles map[string]map[string]string `json:"profiles"`
	Fallback struct {
		Intent     string `json:"intent"`
		Complexity string `json:"complexity"`
	} `json:"fallback"`
}

type jevWorkspaceSettings struct {
	AutoRoutingEnabled bool           `json:"autoRoutingEnabled"`
	RouteConfig        jevRouteConfig `json:"routeConfig"`
}

func defaultJevRouteConfig() jevRouteConfig {
	profiles := make(map[string]map[string]string, len(defaultJevProfiles))
	for intent, tiers := range defaultJevProfiles {
		profiles[intent] = map[string]string{}
		for tier, model := range tiers {
			profiles[intent][tier] = model
		}
	}
	return jevRouteConfig{Alias: defaultJevAlias, Profiles: profiles, Fallback: struct {
		Intent     string `json:"intent"`
		Complexity string `json:"complexity"`
	}{Intent: "other", Complexity: "standard"}}
}

func readJevWorkspaceSettings(ctx context.Context, s *Server, workspaceID string) (jevWorkspaceSettings, error) {
	settings := jevWorkspaceSettings{RouteConfig: defaultJevRouteConfig()}
	var raw string
	if err := s.Store.DB.QueryRowContext(ctx, `SELECT settings_json FROM workspaces WHERE id=?`, workspaceID).Scan(&raw); err != nil {
		return settings, err
	}
	var all map[string]json.RawMessage
	if json.Unmarshal([]byte(raw), &all) != nil {
		return settings, nil
	}
	var stored struct {
		AutoRoutingEnabled bool            `json:"autoRoutingEnabled"`
		RouteConfig        json.RawMessage `json:"routeConfig"`
	}
	if value, ok := all["jev"]; ok {
		_ = json.Unmarshal(value, &stored)
	}
	settings.AutoRoutingEnabled = stored.AutoRoutingEnabled
	if len(stored.RouteConfig) > 0 && string(stored.RouteConfig) != "null" {
		var route jevRouteConfig
		if json.Unmarshal(stored.RouteConfig, &route) == nil {
			mergeJevRouteConfig(&settings.RouteConfig, route)
		}
	}
	return settings, nil
}

func mergeJevRouteConfig(dst *jevRouteConfig, src jevRouteConfig) {
	if strings.TrimSpace(src.Alias) != "" {
		dst.Alias = strings.TrimSpace(src.Alias)
	}
	for intent, tiers := range src.Profiles {
		if dst.Profiles[intent] == nil {
			dst.Profiles[intent] = map[string]string{}
		}
		for tier, model := range tiers {
			if strings.TrimSpace(model) != "" {
				dst.Profiles[intent][tier] = strings.TrimSpace(model)
			}
		}
	}
	if src.Fallback.Intent != "" {
		dst.Fallback.Intent = src.Fallback.Intent
	}
	if src.Fallback.Complexity != "" {
		dst.Fallback.Complexity = src.Fallback.Complexity
	}
}

func extractJevText(path string, body []byte) string {
	var value map[string]any
	if json.Unmarshal(body, &value) != nil {
		return ""
	}
	var parts []string
	if path == "/v1/chat/completions" {
		if messages, ok := value["messages"].([]any); ok {
			for _, item := range messages {
				message, ok := item.(map[string]any)
				if !ok || message["role"] != "user" {
					continue
				}
				parts = append(parts, textValue(message["content"]))
			}
		}
	} else if path == "/v1/responses" {
		parts = append(parts, textValue(value["input"]))
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func textValue(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	items, ok := value.([]any)
	if !ok {
		return ""
	}
	var parts []string
	for _, item := range items {
		part, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if text, ok := part["text"].(string); ok {
			parts = append(parts, text)
		}
		if content, ok := part["content"]; ok {
			parts = append(parts, textValue(content))
		}
	}
	return strings.Join(parts, "\n")
}

func classifyJevText(text string) (string, string) {
	lower := strings.ToLower(text)
	intent := "other"
	switch {
	case strings.Contains(lower, "```"), strings.Contains(lower, "stack trace"), strings.Contains(lower, "bug"), strings.Contains(lower, "代码"), strings.Contains(lower, "编程"):
		intent = "code"
	case strings.Contains(lower, "image"), strings.Contains(lower, "video"), strings.Contains(lower, "图片"), strings.Contains(lower, "视频"):
		intent = "media"
	case strings.Contains(lower, "分析"), strings.Contains(lower, "研究"), strings.Contains(lower, "architecture"), strings.Contains(lower, "compare"):
		intent = "analysis"
	case strings.Contains(lower, "password"), strings.Contains(lower, "token"), strings.Contains(lower, "secret"), strings.Contains(lower, "密码"), strings.Contains(lower, "密钥"):
		intent = "sensitive"
	case strings.Contains(lower, "write"), strings.Contains(lower, "email"), strings.Contains(lower, "聊天"), strings.Contains(lower, "写"):
		intent = "chat"
	}
	complexity := "standard"
	if len([]rune(text)) < 220 {
		complexity = "light"
	}
	if len([]rune(text)) > 1800 || strings.Contains(lower, "architecture") || strings.Contains(lower, "debug") || strings.Contains(lower, "设计") {
		complexity = "advanced"
	}
	return intent, complexity
}

func (s *Server) resolveWorkspaceModel(ctx context.Context, k APIKey, requested, path string, body []byte) (string, error) {
	settings, err := readJevWorkspaceSettings(ctx, s, k.WorkspaceID)
	if err != nil {
		return "", err
	}
	alias := settings.RouteConfig.Alias
	if alias == "" {
		alias = defaultJevAlias
	}
	if requested != alias && requested != defaultJevAlias {
		return requested, nil
	}
	if !settings.AutoRoutingEnabled {
		return "", errAutoRoutingDisabled
	}
	intent, complexity := classifyJevText(extractJevText(path, body))
	profiles := []map[string]string{settings.RouteConfig.Profiles[intent], settings.RouteConfig.Profiles[settings.RouteConfig.Fallback.Intent]}
	tiers := []string{complexity, "standard", "light", "advanced"}
	for _, profile := range profiles {
		for _, tier := range tiers {
			model := strings.TrimSpace(profile[tier])
			if model == "" {
				continue
			}
			if _, err := s.keyChannelsForModel(ctx, k, model); err == nil {
				return model, nil
			}
		}
	}
	return "", fmt.Errorf("%w: %s/%s", errAutoRouteUnavailable, intent, complexity)
}

func (s *Server) keyChannelsForModel(ctx context.Context, k APIKey, model string) ([]provider.Channel, error) {
	var group, limits string
	if err := s.Store.DB.QueryRowContext(ctx, `SELECT group_name,model_limits_json FROM api_keys WHERE id=?`, k.ID).Scan(&group, &limits); err != nil {
		return nil, err
	}
	if group == "" {
		group = "default"
	}
	var enabled int
	var groupModels string
	if err := s.Store.DB.QueryRowContext(ctx, `SELECT enabled,models_json FROM model_groups WHERE name=?`, group).Scan(&enabled, &groupModels); err != nil || enabled != 1 {
		return nil, fmt.Errorf("model group is unavailable")
	}
	var keyLimits, groupLimits []string
	_ = json.Unmarshal([]byte(limits), &keyLimits)
	_ = json.Unmarshal([]byte(groupModels), &groupLimits)
	if !modelInLimits(model, keyLimits) || !modelInLimits(model, groupLimits) {
		return nil, fmt.Errorf("model is not allowed by key or group")
	}
	channels, err := provider.Accessible(ctx, s.Store, k.WorkspaceID, model)
	if err != nil {
		return nil, err
	}
	for _, ch := range channels {
		if ch.Config.InGroup(group) {
			return channels, nil
		}
	}
	return nil, fmt.Errorf("model is unavailable")
}
