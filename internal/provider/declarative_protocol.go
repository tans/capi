package provider

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type ProtocolAuth struct {
	Type   string `json:"type"`
	Header string `json:"header,omitempty"`
}
type ValueMapping struct {
	From    string          `json:"from,omitempty"`
	Default json.RawMessage `json:"default,omitempty"`
	Value   json.RawMessage `json:"value,omitempty"`
	Map     map[string]any  `json:"map,omitempty"`
}
type ImageProtocol struct {
	Version  int                     `json:"version"`
	Endpoint string                  `json:"endpoint"`
	Auth     *ProtocolAuth           `json:"auth,omitempty"`
	Request  map[string]ValueMapping `json:"request"`
	Response struct {
		ImagesPath        string `json:"imagesPath"`
		URLPath           string `json:"urlPath,omitempty"`
		Base64Path        string `json:"base64Path,omitempty"`
		RevisedPromptPath string `json:"revisedPromptPath,omitempty"`
	} `json:"response"`
	Task *struct {
		IDPath           string `json:"idPath"`
		StatusEndpoint   string `json:"statusEndpoint"`
		StatusPath       string `json:"statusPath"`
		ResultImagesPath string `json:"resultImagesPath"`
		CompletedStatus  string `json:"completedStatus,omitempty"`
		FailedStatus     string `json:"failedStatus,omitempty"`
		PollIntervalMS   int    `json:"pollIntervalMs,omitempty"`
	} `json:"task,omitempty"`
}
type VideoProtocol struct {
	Version int           `json:"version"`
	Auth    *ProtocolAuth `json:"auth,omitempty"`
	Submit  struct {
		Endpoint string                  `json:"endpoint"`
		Request  map[string]ValueMapping `json:"request"`
	} `json:"submit"`
	TaskIDPath string `json:"taskIdPath"`
	Poll       struct {
		Endpoint        string   `json:"endpoint"`
		StatusPath      string   `json:"statusPath"`
		ResultURLPath   string   `json:"resultUrlPath"`
		ErrorPath       string   `json:"errorPath,omitempty"`
		SuccessStatuses []string `json:"successStatuses,omitempty"`
		FailureStatuses []string `json:"failureStatuses,omitempty"`
	} `json:"poll"`
	RequiredInput []string `json:"requiredInput,omitempty"`
}

func hasProtocol(raw json.RawMessage) bool { return len(raw) > 0 && string(raw) != "null" }
func decodeProtocol[T any](raw json.RawMessage) (T, error) {
	var out T
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	err := dec.Decode(&out)
	return out, err
}
func ImageConfig(c ChannelConfig) (*ImageProtocol, error) {
	if !hasProtocol(c.ImageProtocolConfig) {
		return nil, nil
	}
	out, err := decodeProtocol[ImageProtocol](c.ImageProtocolConfig)
	return &out, err
}
func VideoConfig(c ChannelConfig) (*VideoProtocol, error) {
	if !hasProtocol(c.VideoProtocolConfig) {
		return nil, nil
	}
	out, err := decodeProtocol[VideoProtocol](c.VideoProtocolConfig)
	return &out, err
}

var dataPathPart = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func validDataPath(path string, root bool) bool {
	if root && path == "$" {
		return true
	}
	path = strings.TrimPrefix(strings.TrimPrefix(path, "$"), ".")
	if path == "" || len(path) > 200 {
		return false
	}
	for _, part := range strings.Split(path, ".") {
		if !dataPathPart.MatchString(part) || part == "__proto__" || part == "constructor" || part == "prototype" {
			return false
		}
	}
	return true
}
func validAuth(auth *ProtocolAuth) bool {
	if auth == nil {
		return true
	}
	if auth.Type == "bearer" {
		return auth.Header == ""
	}
	if auth.Type != "api-key-header" || auth.Header == "" || strings.ContainsAny(auth.Header, " \t\r\n:") {
		return false
	}
	switch strings.ToLower(auth.Header) {
	case "host", "connection", "content-length", "cookie", "set-cookie", "transfer-encoding":
		return false
	}
	return true
}
func validMappings(mappings map[string]ValueMapping) bool {
	if len(mappings) == 0 || len(mappings) > 100 {
		return false
	}
	for target, mapping := range mappings {
		if !validDataPath(target, false) {
			return false
		}
		if mapping.From != "" {
			if !validDataPath(mapping.From, true) || len(mapping.Value) > 0 {
				return false
			}
		} else if len(mapping.Value) == 0 || len(mapping.Default) > 0 {
			return false
		}
		for _, raw := range []json.RawMessage{mapping.Value, mapping.Default} {
			if len(raw) > 0 {
				var value any
				if json.Unmarshal(raw, &value) != nil || !scalar(value) {
					return false
				}
			}
		}
		if len(mapping.Map) > 64 || mapping.From == "" && len(mapping.Map) > 0 {
			return false
		}
		for key, value := range mapping.Map {
			if len(key) > 200 || !scalar(value) {
				return false
			}
		}
		// Overlapping targets are order-dependent when Go iterates a map.
		for other := range mappings {
			if other != target && strings.HasPrefix(other, target+".") {
				return false
			}
		}
	}
	return true
}

func scalar(value any) bool {
	switch value.(type) {
	case nil, string, float64, bool:
		return true
	}
	return false
}

func ValidateProtocolConfig(config ChannelConfig) error {
	if len(config.ImageProtocolConfig) > 16_384 || len(config.VideoProtocolConfig) > 24_000 {
		return fmt.Errorf("protocol configuration is too large")
	}
	image, err := ImageConfig(config)
	if err != nil {
		return fmt.Errorf("invalid image protocol: %w", err)
	}
	if image != nil {
		if image.Version != 1 || image.Endpoint == "" || !ValidEndpoint(image.Endpoint, false) || !validAuth(image.Auth) || !validMappings(image.Request) || !validDataPath(image.Response.ImagesPath, true) || (image.Response.URLPath == "" && image.Response.Base64Path == "") {
			return fmt.Errorf("invalid image protocol mapping")
		}
		for _, path := range []string{image.Response.URLPath, image.Response.Base64Path, image.Response.RevisedPromptPath} {
			if path != "" && !validDataPath(path, true) {
				return fmt.Errorf("invalid image response path")
			}
		}
		if t := image.Task; t != nil {
			if !validDataPath(t.IDPath, true) || !validDataPath(t.StatusPath, true) || !validDataPath(t.ResultImagesPath, true) || t.StatusEndpoint == "" || !ValidEndpoint(t.StatusEndpoint, true) || t.PollIntervalMS < 0 || t.PollIntervalMS > 10_000 {
				return fmt.Errorf("invalid image task polling")
			}
		}
	}
	video, err := VideoConfig(config)
	if err != nil {
		return fmt.Errorf("invalid video protocol: %w", err)
	}
	if video != nil {
		if video.Version != 1 || video.Submit.Endpoint == "" || !ValidEndpoint(video.Submit.Endpoint, true) || !validAuth(video.Auth) || !validMappings(video.Submit.Request) || !validDataPath(video.TaskIDPath, true) || video.Poll.Endpoint == "" || !ValidEndpoint(video.Poll.Endpoint, true) || !validDataPath(video.Poll.StatusPath, true) || !validDataPath(video.Poll.ResultURLPath, true) || (video.Poll.ErrorPath != "" && !validDataPath(video.Poll.ErrorPath, true)) {
			return fmt.Errorf("invalid video protocol mapping")
		}
		for _, path := range video.RequiredInput {
			if !validDataPath(path, true) {
				return fmt.Errorf("invalid required input path")
			}
		}
	}
	return nil
}

func ReadDataPath(value any, path string) (any, bool) {
	if path == "$" {
		return value, true
	}
	path = strings.TrimPrefix(strings.TrimPrefix(path, "$"), ".")
	for _, part := range strings.Split(path, ".") {
		switch current := value.(type) {
		case map[string]any:
			var ok bool
			value, ok = current[part]
			if !ok {
				return nil, false
			}
		case []any:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(current) {
				return nil, false
			}
			value = current[index]
		default:
			return nil, false
		}
	}
	return value, true
}
func writeDataPath(target map[string]any, path string, value any) {
	parts := strings.Split(strings.TrimPrefix(strings.TrimPrefix(path, "$"), "."), ".")
	for _, part := range parts[:len(parts)-1] {
		next, ok := target[part].(map[string]any)
		if !ok {
			next = map[string]any{}
			target[part] = next
		}
		target = next
	}
	target[parts[len(parts)-1]] = value
}
func mappedRequest(mapping map[string]ValueMapping, input map[string]any) ([]byte, error) {
	body := map[string]any{}
	for target, rule := range mapping {
		var value any
		var exists bool
		if rule.From != "" {
			value, exists = ReadDataPath(input, rule.From)
			if !exists || value == nil {
				if len(rule.Default) > 0 {
					if err := json.Unmarshal(rule.Default, &value); err != nil {
						return nil, err
					}
					exists = true
				}
			}
			if mapped, ok := rule.Map[fmt.Sprint(value)]; ok {
				value = mapped
			}
		} else {
			if err := json.Unmarshal(rule.Value, &value); err != nil {
				return nil, err
			}
			exists = true
		}
		if exists {
			writeDataPath(body, target, value)
		}
	}
	return json.Marshal(body)
}

func PrepareProtocolRequest(c Channel, endpoint, model string, raw []byte) (string, []byte, *ProtocolAuth, error) {
	var input map[string]any
	if endpoint == "/v1/evaluate" || endpoint == "/v1/systemone" {
		return PrepareEvaluateRequest(c, endpoint, raw)
	}
	if endpoint == "/v1/images/generations" || endpoint == "/v1/images/edits" {
		image, err := ImageConfig(c.Config)
		if err != nil {
			return "", nil, nil, err
		}
		if image != nil {
			if json.Unmarshal(raw, &input) != nil {
				return "", nil, nil, fmt.Errorf("declarative image adapters require JSON input")
			}
			body, err := mappedRequest(image.Request, input)
			return image.Endpoint, body, image.Auth, err
		}
	}
	if endpoint == "/v1/videos" {
		video, err := VideoConfig(c.Config)
		if err != nil {
			return "", nil, nil, err
		}
		if video != nil {
			if json.Unmarshal(raw, &input) != nil {
				return "", nil, nil, fmt.Errorf("declarative video adapters require JSON input")
			}
			for _, path := range video.RequiredInput {
				value, ok := ReadDataPath(input, path)
				if !ok || value == nil || value == "" {
					return "", nil, nil, fmt.Errorf("required video input %q is missing", path)
				}
			}
			body, err := mappedRequest(video.Submit.Request, input)
			return ExpandEndpoint(video.Submit.Endpoint, "", model), body, video.Auth, err
		}
	}
	return ChannelEndpoint(c, endpoint), raw, nil, nil
}

func ApplyProtocolAuth(req *http.Request, c Channel, auth *ProtocolAuth) {
	if auth != nil && auth.Type == "api-key-header" {
		req.Header.Del("Authorization")
		req.Header.Set(auth.Header, c.APIKey)
	}
	ApplyChannelHeaders(req, c)
}
func ExpandEndpoint(endpoint, id, model string) string {
	return strings.NewReplacer("{task_id}", url.PathEscape(id), "{id}", url.PathEscape(id), "{model}", url.PathEscape(model)).Replace(endpoint)
}
func EndpointURL(base, endpoint string) string {
	base = strings.TrimRight(base, "/")
	if strings.HasSuffix(base, "/v1") && strings.HasPrefix(endpoint, "/v1/") {
		endpoint = strings.TrimPrefix(endpoint, "/v1")
	}
	return base + endpoint
}

func NormalizeImageResponse(config *ImageProtocol, raw []byte) ([]byte, error) {
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	images, ok := ReadDataPath(payload, config.Response.ImagesPath)
	items, array := images.([]any)
	if !ok || !array || len(items) == 0 {
		return nil, fmt.Errorf("configured image list was not found")
	}
	data := []map[string]any{}
	for _, item := range items {
		result := map[string]any{}
		for output, path := range map[string]string{"url": config.Response.URLPath, "b64_json": config.Response.Base64Path, "revised_prompt": config.Response.RevisedPromptPath} {
			if path != "" {
				if v, ok := ReadDataPath(item, path); ok {
					if text, ok := v.(string); ok && text != "" {
						result[output] = text
					}
				}
			}
		}
		if result["url"] == nil && result["b64_json"] == nil {
			return nil, fmt.Errorf("configured image item contains no URL or base64")
		}
		data = append(data, result)
	}
	return json.Marshal(map[string]any{"created": time.Now().Unix(), "data": data})
}
func NormalizeVideoSubmission(config *VideoProtocol, raw []byte) ([]byte, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	id, ok := ReadDataPath(value, config.TaskIDPath)
	text, valid := id.(string)
	if !ok || !valid || text == "" || len(text) > 500 {
		return nil, fmt.Errorf("configured video task ID was not found")
	}
	return json.Marshal(map[string]any{"id": text, "status": "queued"})
}
func NormalizeVideoPoll(config *VideoProtocol, raw []byte) ([]byte, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	v, ok := ReadDataPath(value, config.Poll.StatusPath)
	text, valid := v.(string)
	if !ok || !valid {
		return nil, fmt.Errorf("configured video task status was not found")
	}
	success := config.Poll.SuccessStatuses
	if len(success) == 0 {
		success = []string{"succeeded", "completed", "success"}
	}
	fail := config.Poll.FailureStatuses
	if len(fail) == 0 {
		fail = []string{"failed", "error", "canceled", "cancelled"}
	}
	status := "running"
	for _, candidate := range success {
		if strings.EqualFold(text, candidate) {
			status = "succeeded"
		}
	}
	for _, candidate := range fail {
		if strings.EqualFold(text, candidate) {
			status = "failed"
		}
	}
	result := map[string]any{"status": status}
	if status == "succeeded" {
		v, ok := ReadDataPath(value, config.Poll.ResultURLPath)
		link, valid := v.(string)
		if !ok || !valid || link == "" {
			return nil, fmt.Errorf("configured video result URL was not found")
		}
		result["result"] = map[string]any{"url": link}
	}
	if config.Poll.ErrorPath != "" {
		if v, ok := ReadDataPath(value, config.Poll.ErrorPath); ok {
			result["error"] = v
		}
	}
	return json.Marshal(result)
}
