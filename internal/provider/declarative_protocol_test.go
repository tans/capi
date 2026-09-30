package provider

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestImageMappingAndNormalization(t *testing.T) {
	raw := json.RawMessage(`{"version":1,"endpoint":"/paint","auth":{"type":"api-key-header","header":"X-Token"},"request":{"input.text":{"from":"prompt"},"size":{"from":"size","default":"square","map":{"1024x1024":"square"}},"count":{"value":1}},"response":{"imagesPath":"output.images","urlPath":"url","revisedPromptPath":"caption"}}`)
	c := Channel{Config: ChannelConfig{ImageProtocolConfig: raw}}
	if err := ValidateProtocolConfig(c.Config); err != nil {
		t.Fatal(err)
	}
	endpoint, body, auth, err := PrepareProtocolRequest(c, "/v1/images/generations", "image", []byte(`{"prompt":"A tree","size":"1024x1024"}`))
	if err != nil || endpoint != "/paint" || auth.Header != "X-Token" {
		t.Fatal(endpoint, auth, err)
	}
	var payload map[string]any
	_ = json.Unmarshal(body, &payload)
	if payload["size"] != "square" || payload["input"].(map[string]any)["text"] != "A tree" {
		t.Fatal(string(body))
	}
	config, _ := ImageConfig(c.Config)
	normalized, err := NormalizeImageResponse(config, []byte(`{"output":{"images":[{"url":"https://example.test/tree.png","caption":"Tree"}]}}`))
	if err != nil || !strings.Contains(string(normalized), `"revised_prompt":"Tree"`) {
		t.Fatal(string(normalized), err)
	}
	if _, err := NormalizeImageResponse(config, []byte(`{"output":{"images":[]}}`)); err == nil {
		t.Fatal("empty upstream output accepted")
	}
}

func TestVideoMappingPollingAndValidation(t *testing.T) {
	raw := json.RawMessage(`{"version":1,"submit":{"endpoint":"/video/{model}","request":{"text":{"from":"prompt"}}},"taskIdPath":"task.id","poll":{"endpoint":"/video/tasks/{id}","statusPath":"state","resultUrlPath":"output.url","successStatuses":["done"],"failureStatuses":["bad"]},"requiredInput":["prompt"]}`)
	c := Channel{Config: ChannelConfig{VideoProtocolConfig: raw}}
	if err := ValidateProtocolConfig(c.Config); err != nil {
		t.Fatal(err)
	}
	endpoint, _, _, err := PrepareProtocolRequest(c, "/v1/videos", "video-model", []byte(`{"prompt":"A tree"}`))
	if err != nil || endpoint != "/video/video-model" {
		t.Fatal(endpoint, err)
	}
	if _, _, _, err := PrepareProtocolRequest(c, "/v1/videos", "video-model", []byte(`{}`)); err == nil {
		t.Fatal("required input was ignored")
	}
	config, _ := VideoConfig(c.Config)
	if _, err := NormalizeVideoSubmission(config, []byte(`{"task":{"id":"job-1"}}`)); err != nil {
		t.Fatal(err)
	}
	out, err := NormalizeVideoPoll(config, []byte(`{"state":"done","output":{"url":"https://example.test/video.mp4"}}`))
	if err != nil || !strings.Contains(string(out), "succeeded") {
		t.Fatal(string(out), err)
	}
	if _, err := NormalizeVideoPoll(config, []byte(`{"state":"done"}`)); err == nil {
		t.Fatal("missing video result accepted")
	}
	if ValidEndpoint("//other.test/path", true) || ValidEndpoint("/a/%2e%2e/b", true) || ValidEndpoint("/a/{unknown}", true) {
		t.Fatal("unsafe endpoint accepted")
	}
	c.Config.VideoProtocolConfig = json.RawMessage(`{"version":1,"unknown":true}`)
	if ValidateProtocolConfig(c.Config) == nil {
		t.Fatal("unknown adapter fields accepted")
	}
}

func TestChannelRoundRobinAndModelMapping(t *testing.T) {
	c := Channel{ID: "round-robin-test", Config: ChannelConfig{Keys: []string{"first", "second"}, MultiKeyMode: "polling", ModelMapping: map[string]string{"public": "upstream"}, ParamOverride: map[string]any{"temperature": 0.2}}}
	first, model, raw, err := PrepareChannel(c, "public", []byte(`{"model":"public","temperature":1}`))
	if err != nil || first.APIKey != "first" || model != "upstream" || !strings.Contains(string(raw), `"temperature":0.2`) {
		t.Fatal(first, model, string(raw), err)
	}
	second, _, _, err := PrepareChannel(c, "public", []byte(`{"model":"public"}`))
	if err != nil || second.APIKey != "second" {
		t.Fatal(second.APIKey, err)
	}
	if !c.Config.InGroup("default") || c.Config.InGroup("other") {
		t.Fatal("default group semantics")
	}
}

func TestProtocolMappingRejectsAmbiguousTargetsAndContainers(t *testing.T) {
	for _, mapping := range []string{
		`{"input":{"value":1},"input.text":{"from":"prompt"}}`,
		`{"input":{"value":{"nested":1}}}`,
		`{"input":{"from":"prompt","map":{"tree":[1]}}}`,
	} {
		var value map[string]ValueMapping
		if err := json.Unmarshal([]byte(mapping), &value); err != nil {
			t.Fatal(err)
		}
		if validMappings(value) {
			t.Errorf("accepted %s", mapping)
		}
	}
}
