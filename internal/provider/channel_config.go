package provider

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
)

// ChannelConfig is the executable configuration behind the restored editor.
// Secret keys are stored here but never included in console list projections.
type ChannelConfig struct {
	Keys                []string          `json:"keys,omitempty"`
	Groups              []string          `json:"groups,omitempty"`
	MultiKeyMode        string            `json:"multiKeyMode,omitempty"`
	AutoBan             *bool             `json:"autoBan,omitempty"`
	ModelMapping        map[string]string `json:"modelMapping,omitempty"`
	Headers             map[string]string `json:"headers,omitempty"`
	ParamOverride       map[string]any    `json:"paramOverride,omitempty"`
	Tag                 string            `json:"tag,omitempty"`
	VideoSubmitPath     string            `json:"videoSubmitPath,omitempty"`
	VideoStatusPath     string            `json:"videoStatusPath,omitempty"`
	EvaluatePath        string            `json:"evaluatePath,omitempty"`
	EvaluateProtocol    string            `json:"evaluateProtocol,omitempty"`
	ImageProtocolConfig json.RawMessage   `json:"imageProtocolConfig,omitempty"`
	VideoProtocolConfig json.RawMessage   `json:"videoProtocolConfig,omitempty"`
	// ProtocolBases and ModelProtocols allow one upstream channel to expose
	// models served by different wire APIs while retaining legacy defaults.
	ProtocolBases  map[string]string `json:"protocolBases,omitempty"`
	ModelProtocols map[string]string `json:"modelProtocols,omitempty"`
}

func (c ChannelConfig) AutomaticDisable() bool { return c.AutoBan == nil || *c.AutoBan }
func (c ChannelConfig) InGroup(group string) bool {
	if group == "" {
		group = "default"
	}
	if len(c.Groups) == 0 {
		return group == "default"
	}
	for _, name := range c.Groups {
		if name == group {
			return true
		}
	}
	return false
}

var keyRoundRobin = struct {
	sync.Mutex
	counters map[string]uint64
}{counters: map[string]uint64{}}

func PrepareChannel(c Channel, model string, body []byte) (Channel, string, []byte, error) {
	if protocol := c.Config.ProtocolFor(model, c.Protocol); protocol != "" {
		c.Protocol = protocol
	}
	if base := c.Config.BaseFor(c.Protocol, c.BaseURL); base != "" {
		c.BaseURL = base
	}
	if len(c.Config.Keys) > 0 {
		index := 0
		if c.Config.MultiKeyMode == "polling" {
			keyRoundRobin.Lock()
			index = int(keyRoundRobin.counters[c.ID] % uint64(len(c.Config.Keys)))
			keyRoundRobin.counters[c.ID]++
			keyRoundRobin.Unlock()
		} else if len(c.Config.Keys) > 1 {
			n, err := rand.Int(rand.Reader, big.NewInt(int64(len(c.Config.Keys))))
			if err != nil {
				return c, model, body, err
			}
			index = int(n.Int64())
		}
		c.APIKey = c.Config.Keys[index]
	}
	if mapped := c.Config.ModelMapping[model]; mapped != "" {
		model = mapped
	}
	if len(c.Config.ParamOverride) > 0 || len(c.Config.ModelMapping) > 0 {
		var value map[string]any
		if json.Unmarshal(body, &value) == nil {
			for key, v := range c.Config.ParamOverride {
				value[key] = v
			}
			if _, hasModel := value["model"]; hasModel {
				value["model"] = model
			}
			encoded, err := json.Marshal(value)
			if err != nil {
				return c, model, body, err
			}
			body = encoded
		} else if len(c.Config.ParamOverride) > 0 {
			return c, model, body, fmt.Errorf("JSON parameter overrides cannot apply to multipart requests")
		}
	}
	return c, model, body, nil
}

func ApplyChannelHeaders(req *http.Request, c Channel) {
	for key, value := range c.Config.Headers {
		req.Header.Set(key, value)
	}
}

func ChannelEndpoint(c Channel, endpoint string) string {
	switch endpoint {
	case "/v1/videos":
		if c.Config.VideoSubmitPath != "" {
			return c.Config.VideoSubmitPath
		}
	case "/v1/evaluate", "/v1/systemone":
		if c.Config.EvaluatePath != "" {
			return c.Config.EvaluatePath
		}
	}
	return endpoint
}

func (c ChannelConfig) ProtocolFor(model, fallback string) string {
	if value := strings.TrimSpace(c.ModelProtocols[model]); value != "" {
		return value
	}
	return fallback
}

func (c ChannelConfig) BaseFor(protocol, fallback string) string {
	if value := strings.TrimSpace(c.ProtocolBases[protocol]); value != "" {
		return strings.TrimRight(value, "/")
	}
	return strings.TrimRight(fallback, "/")
}

// Decode config without allowing a corrupt row to silently drop fields.
func DecodeChannelConfig(raw string) (ChannelConfig, error) {
	var c ChannelConfig
	dec := json.NewDecoder(bytes.NewBufferString(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&c); err != nil {
		return c, err
	}
	if c.MultiKeyMode == "" {
		c.MultiKeyMode = "random"
	}
	if c.EvaluateProtocol == "" {
		c.EvaluateProtocol = "generic"
	}
	for name, value := range c.ProtocolBases {
		if name != "openai" && name != "anthropic" && name != "gemini" && name != "responses" {
			return c, fmt.Errorf("unsupported protocol base %q", name)
		}
		if strings.TrimSpace(value) == "" {
			return c, fmt.Errorf("protocol base %q is empty", name)
		}
	}
	for model, protocol := range c.ModelProtocols {
		if strings.TrimSpace(model) == "" || (protocol != "openai" && protocol != "anthropic" && protocol != "gemini" && protocol != "responses") {
			return c, fmt.Errorf("invalid model protocol mapping for %q", model)
		}
	}
	return c, nil
}

func ValidEndpoint(value string, template bool) bool {
	if value == "" {
		return true
	}
	if len(value) > 1000 || !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") || strings.ContainsAny(value, "#\\\r\n") {
		return false
	}
	candidate := value
	if template {
		candidate = ExpandEndpoint(value, "id", "model")
	}
	if strings.ContainsAny(candidate, "{}") {
		return false
	}
	parsed, err := url.Parse(candidate)
	if err != nil || parsed.Host != "" || parsed.Scheme != "" {
		return false
	}
	for _, part := range strings.Split(parsed.Path, "/") {
		if part == "." || part == ".." {
			return false
		}
	}
	return true
}
