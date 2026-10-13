// Package channel holds the channel editor's domain rules: decoding the
// patch-style editor payload, applying it onto a provider.Channel, validating
// the result, and projecting it for console responses. Storage and upstream
// probing stay in internal/provider.
package channel

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/tans/capi/internal/provider"
)

// ErrInvalidStatus is returned by Build when status is neither 1 nor 3.
var ErrInvalidStatus = errors.New("use enabled (1) or disabled (3)")

// Input is the patch-style editor payload. Nested ChannelConfig fields are
// only applied when present in the request, so a PATCH leaves the rest of an
// existing channel untouched. The embedded config's scalar fields are decided
// by presence, not zero value.
type Input struct {
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
	// present records which keys appeared in the raw JSON so optional nested
	// config fields can be distinguished from "leave unchanged".
	present map[string]bool
}

// ParseInput strictly decodes the raw JSON fields of an editor request and
// remembers which keys were present.
func ParseInput(fields map[string]json.RawMessage) (Input, error) {
	encoded, _ := json.Marshal(fields)
	var in Input
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&in); err != nil {
		return in, err
	}
	in.present = make(map[string]bool, len(fields))
	for name := range fields {
		in.present[name] = true
	}
	return in, nil
}

// Build applies the editor input onto ch. ch carries the identity defaults
// (ID, workspace scope, protocol, flags) set up by the caller; Build mutates
// only what the request supplied plus the fixed normalization rules.
func Build(in Input, ch provider.Channel) (provider.Channel, error) {
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
			return ch, ErrInvalidStatus
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
	if in.present["tag"] {
		ch.Config.Tag = in.Tag
	}
	if in.present["videoSubmitPath"] {
		ch.Config.VideoSubmitPath = in.VideoSubmitPath
	}
	if in.present["videoStatusPath"] {
		ch.Config.VideoStatusPath = in.VideoStatusPath
	}
	if in.present["systemonePath"] {
		ch.Config.SystemOnePath = in.SystemOnePath
	}
	if in.present["systemoneProtocol"] {
		ch.Config.SystemOneProtocol = in.SystemOneProtocol
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
	if ch.Config.SystemOneProtocol == "" {
		ch.Config.SystemOneProtocol = "generic"
	}
	return ch, nil
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

// Validate checks the channel's shape. Group existence and model discovery
// need external state and stay in the caller.
func Validate(ch provider.Channel) error {
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
		if !modelMatches(ch.Models, model) {
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
	if !provider.ValidEndpoint(ch.Config.VideoSubmitPath, false) || !provider.ValidEndpoint(ch.Config.VideoStatusPath, true) || !provider.ValidEndpoint(ch.Config.SystemOnePath, false) {
		return fmt.Errorf("custom endpoints must be relative paths")
	}
	if ch.Config.SystemOneProtocol != "generic" && ch.Config.SystemOneProtocol != "typesafe" {
		return fmt.Errorf("unsupported System One protocol")
	}
	// Declarative protocol adapters are validated by the execution layer.
	if err := provider.ValidateProtocolConfig(ch.Config); err != nil {
		return err
	}
	return nil
}

func modelMatches(models []string, model string) bool {
	for _, candidate := range models {
		if candidate == model || candidate == "*" || (strings.HasSuffix(candidate, "/*") && strings.HasPrefix(model, strings.TrimSuffix(candidate, "*"))) {
			return true
		}
	}
	return false
}

// Project renders a channel for console responses. Secret keys are never
// included.
func Project(ch provider.Channel, lastError string) map[string]any {
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
	return map[string]any{"id": ch.ID, "name": ch.Name, "type": ch.Protocol, "protocol": ch.Protocol, "baseUrl": ch.BaseURL, "base_url": ch.BaseURL, "models": ch.Models, "groups": groups, "priority": ch.Priority, "weight": ch.Weight, "enabled": ch.Enabled, "status": status, "autoBan": ch.Config.AutomaticDisable(), "multiKeyMode": ch.Config.MultiKeyMode, "modelMapping": orEmptyMap(ch.Config.ModelMapping), "protocolBases": orEmptyMap(ch.Config.ProtocolBases), "modelProtocols": orEmptyMap(ch.Config.ModelProtocols), "headers": orEmptyMap(ch.Config.Headers), "paramOverride": orEmptyMap(ch.Config.ParamOverride), "tag": ch.Config.Tag, "videoSubmitPath": ch.Config.VideoSubmitPath, "videoStatusPath": ch.Config.VideoStatusPath, "systemonePath": ch.Config.SystemOnePath, "systemoneProtocol": ch.Config.SystemOneProtocol, "imageProtocolConfig": rawOrNull(ch.Config.ImageProtocolConfig), "videoProtocolConfig": rawOrNull(ch.Config.VideoProtocolConfig), "keyCount": keys, "lastError": lastError}
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