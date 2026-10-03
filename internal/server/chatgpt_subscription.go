package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/provider"
)

// KeepChatGPTSubscriptionsAlive refreshes credentials at a low frequency so
// rotated refresh tokens are persisted even when traffic is idle.
func (s *Server) KeepChatGPTSubscriptionsAlive(ctx context.Context) {
	refresh := func() {
		rows, err := s.Store.DB.QueryContext(ctx, `SELECT id,api_key FROM channels WHERE protocol='chatgpt-subscription' AND enabled=1`)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var id, stored string
			if rows.Scan(&id, &stored) != nil {
				continue
			}
			raw, err := s.decryptSubscription(stored)
			if err != nil {
				continue
			}
			_, updated, err := provider.CodexQuota(ctx, raw)
			if err == nil && len(updated) > 0 && string(updated) != string(raw) {
				_ = s.saveSubscriptionCredentials(ctx, id, updated)
			}
		}
	}
	refresh()
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			refresh()
		}
	}
}

func (s *Server) saveSubscriptionCredentials(ctx context.Context, id string, raw []byte) error {
	stored, err := s.encryptSubscription(raw)
	if err != nil {
		return err
	}
	_, err = s.Store.DB.ExecContext(ctx, `UPDATE channels SET api_key=?,updated_at=? WHERE id=?`, stored, time.Now().UTC().Format(time.RFC3339Nano), id)
	return err
}

func (s *Server) importChatGPTSubscription(w http.ResponseWriter, r *http.Request) {
	if !s.sameOrigin(r) {
		apiError(w, 403, "bad_origin", "Origin is not allowed.")
		return
	}
	wid := r.PathValue("wid")
	_, role, err := s.requireWorkspaceRole(r, wid)
	if err != nil || (role != "owner" && role != "admin") {
		apiError(w, 403, "forbidden", "Workspace admin required.")
		return
	}
	var in struct {
		AuthJSON json.RawMessage `json:"auth_json"`
		Name     string          `json:"name"`
		Priority int             `json:"priority"`
		Weight   int             `json:"weight"`
	}
	if readJSON(r, &in) != nil || len(in.AuthJSON) == 0 {
		apiError(w, 400, "invalid_request", "auth_json from Codex CLI is required.")
		return
	}
	raw := []byte(in.AuthJSON)
	if len(raw) > 0 && raw[0] == '"' {
		var text string
		if json.Unmarshal(raw, &text) == nil {
			raw = []byte(text)
		}
	}
	if _, err := provider.ParseCodexAuth(raw); err != nil {
		apiError(w, 400, "invalid_codex_auth", err.Error())
		return
	}
	models, updated, err := provider.CodexModels(r.Context(), raw)
	if err != nil {
		apiError(w, 400, "codex_models_failed", err.Error())
		return
	}
	if len(updated) > 0 {
		raw = updated
	}
	email, plan, _ := provider.CodexIdentity(raw)
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = "ChatGPT"
		if plan != "" {
			name += " " + strings.ToUpper(plan[:1]) + plan[1:]
		}
		if email != "" {
			name += " · " + email
		}
	}
	if in.Weight < 1 {
		in.Weight = 1
	}
	id := auth.RandomID("chn_")
	ch := provider.Channel{ID: id, WorkspaceID: &wid, Name: name, Protocol: "chatgpt-subscription", BaseURL: provider.CodexBase, APIKey: string(raw), Models: models, Priority: in.Priority, Weight: in.Weight, Enabled: true}
	if err := provider.Create(r.Context(), s.Store, ch); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 201, map[string]any{"id": id, "name": name, "protocol": "chatgpt-subscription", "models": models, "plan": plan, "email": email})
}

func (s *Server) chatGPTQuota(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	if _, _, err := s.requireWorkspaceRole(r, wid); err != nil {
		apiError(w, 403, "forbidden", "Workspace access required.")
		return
	}
	ch, err := provider.GetByID(r.Context(), s.Store, r.PathValue("id"))
	if err != nil || ch.WorkspaceID == nil || *ch.WorkspaceID != wid || ch.Protocol != "chatgpt-subscription" {
		apiError(w, 404, "not_found", "ChatGPT subscription not found.")
		return
	}
	raw, err := s.decryptSubscription(ch.APIKey)
	if err != nil {
		apiError(w, 500, "credential_decryption_failed", "Could not read ChatGPT credentials.")
		return
	}
	q, updated, err := provider.CodexQuota(r.Context(), raw)
	if err != nil {
		apiError(w, 502, "chatgpt_usage_failed", err.Error())
		return
	}
	if len(updated) > 0 && string(updated) != string(raw) {
		if encrypted, encryptErr := s.encryptSubscription(updated); encryptErr == nil {
			_, _ = s.Store.DB.ExecContext(r.Context(), `UPDATE channels SET api_key=?,updated_at=? WHERE id=?`, encrypted, time.Now().UTC().Format(time.RFC3339Nano), ch.ID)
		}
	}
	writeJSON(w, 200, q)
}

func codexBody(body []byte, stream bool) ([]byte, error) {
	var m map[string]any
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, err
	}
	if model, ok := m["model"].(string); ok {
		m["model"] = strings.TrimPrefix(model, "codex/")
	}
	m["stream"] = stream
	m["store"] = false
	for _, k := range []string{"temperature", "top_p", "user", "safety_identifier"} {
		delete(m, k)
	}
	return json.Marshal(m)
}
