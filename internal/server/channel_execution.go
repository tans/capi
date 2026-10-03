package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/tans/capi/internal/provider"
)

func (s *Server) keyChannels(r *http.Request, k APIKey, model string) ([]provider.Channel, error) {
	var group, limits string
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT group_name,model_limits_json FROM api_keys WHERE id=?`, k.ID).Scan(&group, &limits); err != nil {
		return nil, err
	}
	if group == "" {
		group = "default"
	}
	var enabled int
	var groupModels string
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT enabled,models_json FROM model_groups WHERE name=?`, group).Scan(&enabled, &groupModels); err != nil || enabled != 1 {
		return nil, fmt.Errorf("model group is unavailable")
	}
	var keyLimits, groupLimits []string
	_ = json.Unmarshal([]byte(limits), &keyLimits)
	_ = json.Unmarshal([]byte(groupModels), &groupLimits)
	allowed := func(value string) bool { return modelInLimits(value, keyLimits) && modelInLimits(value, groupLimits) }
	if model != "" && !allowed(model) {
		return nil, fmt.Errorf("model is not allowed by key or group")
	}
	channels, err := provider.Accessible(r.Context(), s.Store, k.WorkspaceID, model)
	if err != nil {
		return nil, err
	}
	out := []provider.Channel{}
	for _, ch := range channels {
		if !ch.Config.InGroup(group) {
			continue
		}
		if model == "" {
			models := []string{}
			for _, name := range ch.Models {
				if allowed(name) {
					models = append(models, name)
				}
			}
			if len(models) == 0 {
				continue
			}
			ch.Models = models
		}
		out = append(out, ch)
	}
	return out, nil
}
func modelInLimits(model string, limits []string) bool {
	if len(limits) == 0 {
		return true
	}
	for _, candidate := range limits {
		if model == candidate || candidate == "*" || (strings.HasSuffix(candidate, "/*") && strings.HasPrefix(model, strings.TrimSuffix(candidate, "*"))) {
			return true
		}
	}
	return false
}

func (s *Server) restChannel(ctx context.Context, ch provider.Channel, reason string, status int, duration time.Duration) {
	s.Router.Rest(ch.ID, reason, status, duration)
	if s.runtimeSettings(ctx).AutoDisableEnabled && ch.Config.AutomaticDisable() && (status == 401 || status == 403 || status == 402) {
		now := time.Now().UTC().Format(time.RFC3339Nano)
		_, err := s.Store.DB.Exec(`UPDATE channels SET enabled=0,last_error=?,auto_disabled_at=?,updated_at=? WHERE id=?`, reason, now, now, ch.ID)
		if err != nil {
			s.Log.Warn("channel_auto_disable_failed", "channel", ch.ID, "error", err)
		}
	}
}

func (s *Server) normalizeConfiguredResponse(r *http.Request, ch provider.Channel, endpoint string, raw []byte) ([]byte, error) {
	if endpoint == "/v1/videos" {
		cfg, err := provider.VideoConfig(ch.Config)
		if err != nil {
			return nil, err
		}
		if cfg != nil {
			return provider.NormalizeVideoSubmission(cfg, raw)
		}
	}
	if endpoint != "/v1/images/generations" && endpoint != "/v1/images/edits" {
		return raw, nil
	}
	cfg, err := provider.ImageConfig(ch.Config)
	if err != nil {
		return nil, err
	}
	if cfg == nil {
		return raw, nil
	}
	if cfg.Task == nil {
		return provider.NormalizeImageResponse(cfg, raw)
	}
	var payload any
	if json.Unmarshal(raw, &payload) != nil {
		return nil, fmt.Errorf("invalid image submission response")
	}
	value, ok := provider.ReadDataPath(payload, cfg.Task.IDPath)
	id, valid := value.(string)
	if !ok || !valid || id == "" || len(id) > 500 {
		return nil, fmt.Errorf("configured image task ID was not found")
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.relayTimeout(r.Context()))
	defer cancel()
	interval := time.Duration(cfg.Task.PollIntervalMS) * time.Millisecond
	if interval < 100*time.Millisecond {
		interval = time.Second
	}
	completed, failed := cfg.Task.CompletedStatus, cfg.Task.FailedStatus
	if completed == "" {
		completed = "completed"
	}
	if failed == "" {
		failed = "failed"
	}
	for {
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, provider.EndpointURL(ch.BaseURL, provider.ExpandEndpoint(cfg.Task.StatusEndpoint, id, "")), nil)
		if err != nil {
			return nil, err
		}
		if ch.APIKey != "" {
			req.Header.Set("Authorization", "Bearer "+ch.APIKey)
		}
		provider.ApplyProtocolAuth(req, ch, cfg.Auth)
		res, err := s.doUpstream(req)
		if err != nil {
			return nil, err
		}
		body, err := io.ReadAll(io.LimitReader(res.Body, 64<<20))
		res.Body.Close()
		if err != nil {
			return nil, err
		}
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			return nil, fmt.Errorf("image polling returned %d", res.StatusCode)
		}
		if json.Unmarshal(body, &payload) != nil {
			return nil, fmt.Errorf("invalid image polling response")
		}
		status, _ := provider.ReadDataPath(payload, cfg.Task.StatusPath)
		if status == failed {
			return nil, fmt.Errorf("image generation failed")
		}
		if status == completed {
			images, ok := provider.ReadDataPath(payload, cfg.Task.ResultImagesPath)
			if !ok {
				return nil, fmt.Errorf("image task result was not found")
			}
			normalized := *cfg
			normalized.Response.ImagesPath = "images"
			encoded, _ := json.Marshal(map[string]any{"images": images})
			return provider.NormalizeImageResponse(&normalized, encoded)
		}
	}
}
