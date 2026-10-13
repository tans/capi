package channel

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/tans/capi/internal/provider"
)

func TestBuildNormalization(t *testing.T) {
	fields := map[string]json.RawMessage{}
	for name, value := range map[string]any{
		"name":           "  New channel  ",
		"type":           "openai-compatible",
		"baseUrl":        "https://upstream.test/v1/",
		"models":         []string{"a", " a ", "b"},
		"weight":         0,
		"status":         3,
		"api_key":        " secret ",
		"groups":         []string{"vip"},
		"multiKeyMode":   "polling",
		"headers":        map[string]string{"X-Tenant": "t"},
		"modelMapping":   map[string]string{"public": "provider"},
		"systemonePath":  "/custom-systemone",
		"protocolBases":  map[string]string{"anthropic": "https://a.test"},
		"systemoneProtocol": "typesafe",
	} {
		encoded, _ := json.Marshal(value)
		fields[name] = encoded
	}
	in, err := ParseInput(fields)
	if err != nil {
		t.Fatal(err)
	}
	ch, err := Build(in, provider.Channel{ID: "chn_x", Protocol: "openai", Enabled: true, Weight: 1, Config: provider.ChannelConfig{Groups: []string{"default"}}})
	if err != nil {
		t.Fatal(err)
	}
	if ch.Name != "New channel" || ch.Protocol != "openai" {
		t.Errorf("name/protocol: %q %q", ch.Name, ch.Protocol)
	}
	if ch.BaseURL != "https://upstream.test/v1/" {
		t.Errorf("baseURL got %q, want no slash-strip", ch.BaseURL)
	}
	if len(ch.Models) != 2 || ch.Models[0] != "a" || ch.Models[1] != "b" {
		t.Errorf("models not deduped: %v", ch.Models)
	}
	if ch.Weight != 1 || ch.Enabled {
		t.Errorf("weight=%d enabled=%v", ch.Weight, ch.Enabled)
	}
	if ch.APIKey != "secret" || len(ch.Config.Keys) != 1 || ch.Config.Keys[0] != "secret" {
		t.Errorf("apiKey/keys not synced: %q %v", ch.APIKey, ch.Config.Keys)
	}
	if len(ch.Config.Groups) != 1 || ch.Config.Groups[0] != "vip" || ch.Config.MultiKeyMode != "polling" {
		t.Errorf("config: groups=%v mode=%q", ch.Config.Groups, ch.Config.MultiKeyMode)
	}
	if ch.Config.Headers["X-Tenant"] != "t" || ch.Config.ModelMapping["public"] != "provider" {
		t.Errorf("nested maps lost: %v %v", ch.Config.Headers, ch.Config.ModelMapping)
	}
	if ch.Config.SystemOnePath != "/custom-systemone" {
		t.Errorf("systemonePath not applied: %q", ch.Config.SystemOnePath)
	}
	if ch.Config.SystemOneProtocol != "typesafe" {
		t.Errorf("systemone protocol: %q, want typesafe", ch.Config.SystemOneProtocol)
	}
	if ch.Config.Tag != "" {
		t.Errorf("absent tag applied: %q", ch.Config.Tag)
	}
}

func TestBuildKeepsUnsuppliedConfig(t *testing.T) {
	// A PATCH that only touches name must not wipe existing nested config.
	fields := map[string]json.RawMessage{}
	for name, value := range map[string]any{"name": "renamed"} {
		encoded, _ := json.Marshal(value)
		fields[name] = encoded
	}
	in, err := ParseInput(fields)
	if err != nil {
		t.Fatal(err)
	}
	existing := provider.Channel{ID: "chn_x", Protocol: "openai", BaseURL: "https://u.test", Enabled: true, Weight: 3, Config: provider.ChannelConfig{Groups: []string{"vip"}, MultiKeyMode: "polling", Tag: "preserve", Headers: map[string]string{"X-T": "v"}}}
	ch, err := Build(in, existing)
	if err != nil {
		t.Fatal(err)
	}
	if ch.Name != "renamed" || ch.Config.Tag != "preserve" || ch.Config.MultiKeyMode != "polling" || ch.Weight != 3 {
		t.Errorf("patch clobbered untouched fields: name=%q tag=%q mode=%q weight=%d", ch.Name, ch.Config.Tag, ch.Config.MultiKeyMode, ch.Weight)
	}
	if ch.Config.Headers["X-T"] != "v" {
		t.Errorf("headers lost: %v", ch.Config.Headers)
	}
}

func TestBuildInvalidStatus(t *testing.T) {
	fields := map[string]json.RawMessage{}
	encoded, _ := json.Marshal(2)
	fields["status"] = encoded
	in, err := ParseInput(fields)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Build(in, provider.Channel{Config: provider.ChannelConfig{Groups: []string{"default"}}}); !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("want ErrInvalidStatus, got %v", err)
	}
}

func TestValidate(t *testing.T) {
	base := provider.Channel{Name: "ok", BaseURL: "https://upstream.test/v1", Protocol: "openai", Weight: 1, Config: provider.ChannelConfig{Groups: []string{"default"}, MultiKeyMode: "random", SystemOneProtocol: "generic"}}
	if err := Validate(base); err != nil {
		t.Fatalf("valid channel rejected: %v", err)
	}
	bad := base
	bad.Config.Headers = map[string]string{"Host": "evil.test"}
	if err := Validate(bad); err == nil {
		t.Fatal("Host header accepted")
	}
	bad = base
	bad.Protocol = "matrix"
	if err := Validate(bad); err == nil {
		t.Fatal("unknown protocol accepted")
	}
	bad = base
	bad.BaseURL = "ftp://upstream.test"
	if err := Validate(bad); err == nil {
		t.Fatal("non-http base accepted")
	}
	bad = base
	bad.Config.ModelProtocols = map[string]string{"nope": "anthropic"}
	if err := Validate(bad); err == nil {
		t.Fatal("model protocol mapping for unknown model accepted")
	}
}

func TestProject(t *testing.T) {
	ch := provider.Channel{ID: "chn_x", Name: "n", Protocol: "openai", BaseURL: "https://u.test", Models: []string{"m"}}
	out := Project(ch, "")
	if out["status"] != 3 || out["keyCount"] != 0 {
		t.Errorf("disabled projection: status=%v keyCount=%v", out["status"], out["keyCount"])
	}
	if g := out["groups"].([]string); len(g) != 1 || g[0] != "default" {
		t.Errorf("groups default: %v", out["groups"])
	}
	ch.Config.Keys = []string{"k1", "k2"}
	ch.Enabled = true
	out = Project(ch, "")
	if out["status"] != 1 || out["keyCount"] != 2 {
		t.Errorf("enabled projection: status=%v keyCount=%v", out["status"], out["keyCount"])
	}
	if _, present := out["api_key"]; present {
		t.Fatal("secret key leaked into projection")
	}
}