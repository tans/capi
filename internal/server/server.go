package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/ops"
	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/redact"
	"github.com/tans/capi/internal/router"
	"github.com/tans/capi/internal/store"
	"github.com/tans/capi/internal/webui"
)

type Server struct {
	Cfg           config.Config
	Store         *store.Store
	Router        *router.Router
	Redact        *redact.Engine
	Log           *slog.Logger
	HTTP          *http.Client
	appSettingsMu sync.Mutex
}

func New(cfg config.Config, st *store.Store, log *slog.Logger) *Server {
	provider.SetSubscriptionSecretDecoder(func(value string) ([]byte, error) {
		return (&Server{Cfg: cfg}).decryptSubscription(value)
	})
	provider.SetSubscriptionSecretEncoder(func(value []byte) (string, error) {
		return (&Server{Cfg: cfg}).encryptSubscription(value)
	})
	s := &Server{Cfg: cfg, Store: st, Router: router.New(), Redact: redact.New(filepath.Join(cfg.DataDir, "redact.key")), Log: log, HTTP: &http.Client{Timeout: cfg.RelayTimeout}}
	s.Router.SetPersistence(st.DB)
	// Test and embedded callers may provide an initial admin email before the
	// database has stored system settings. Production settings are database-only.
	if cfg.AdminEmail != "" {
		var raw string
		if st.DB.QueryRow(`SELECT config_json FROM app_settings WHERE id=1`).Scan(&raw) == nil && raw == "{}" {
			settings := emptyPricing()
			if cfg.RelayTimeout >= time.Second {
				settings.RequestTimeoutMs = cfg.RelayTimeout.Milliseconds()
			}
			settings.AdminEmail = cfg.AdminEmail
			settings.PublicBaseURL = cfg.PublicBaseURL
			settings.AlertWebhookURL = cfg.AlertWebhookURL
			settings.BackupRetention = cfg.BackupRetention
			settings.LogLevel = cfg.LogLevel
			settings.Redact = cfg.Redact
			settings.CodexVersion = cfg.CodexVersion
			if encoded, err := json.Marshal(settings); err == nil {
				_, _ = st.DB.Exec(`UPDATE app_settings SET config_json=? WHERE id=1`, string(encoded))
			}
		}
	}
	return s
}

func (s *Server) runtimeSettings(ctx context.Context) storedPricing {
	settings, err := s.readStoredPricing(ctx)
	if err != nil {
		return emptyPricing()
	}
	return settings
}

func (s *Server) relayTimeout(ctx context.Context) time.Duration {
	return time.Duration(s.runtimeSettings(ctx).RequestTimeoutMs) * time.Millisecond
}

func (s *Server) redactEnabled(ctx context.Context) bool {
	return s.runtimeSettings(ctx).Redact
}

func (s *Server) doUpstream(req *http.Request) (*http.Response, error) {
	client := *s.HTTP
	client.Timeout = s.relayTimeout(req.Context())
	return client.Do(req)
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", s.health)
	mux.HandleFunc("GET /api/readyz", s.ready)
	mux.HandleFunc("POST /api/auth/register", s.register)
	mux.HandleFunc("POST /api/auth/login", s.login)
	mux.HandleFunc("POST /api/auth/logout", s.logout)
	mux.HandleFunc("POST /api/auth/forgot-password/code", s.forgotPasswordCode)
	mux.HandleFunc("POST /api/auth/forgot-password/reset", s.forgotPasswordReset)
	mux.HandleFunc("GET /api/auth/me", s.me)
	mux.HandleFunc("GET /api/user/account", s.consoleAccount)
	mux.HandleFunc("PUT /api/user/password", s.consolePassword)
	mux.HandleFunc("GET /api/user/settings", s.consoleUserSettings)
	mux.HandleFunc("PUT /api/user/settings", s.consoleUserSettings)
	mux.HandleFunc("GET /api/workspaces/{wid}/members", s.consoleMembers)
	mux.HandleFunc("POST /api/workspaces/{wid}/members", s.consoleMembers)
	mux.HandleFunc("PATCH /api/workspaces/{wid}/members/{id}", s.consoleMembers)
	mux.HandleFunc("DELETE /api/workspaces/{wid}/members/{id}", s.consoleMemberDelete)
	mux.HandleFunc("DELETE /api/workspaces/{wid}/invites/{id}", s.consoleMembers)
	mux.HandleFunc("GET /api/invites/{token}", s.acceptWorkspaceInvite)
	mux.HandleFunc("POST /api/invites/{token}/accept", s.acceptWorkspaceInvite)
	mux.HandleFunc("GET /api/workspaces", s.listWorkspaces)
	mux.HandleFunc("GET /api/public/models", s.publicModels)
	mux.HandleFunc("GET /api/public/brand", s.publicBrand)
	mux.HandleFunc("POST /api/workspaces", s.consoleCreateWorkspace)
	mux.HandleFunc("GET /api/workspaces/{wid}", s.consoleWorkspace)
	mux.HandleFunc("PATCH /api/workspaces/{wid}", s.consoleWorkspace)
	mux.HandleFunc("PATCH /api/workspaces/{wid}/keys", s.consoleKeys)
	mux.HandleFunc("DELETE /api/workspaces/{wid}/keys", s.consoleKeys)
	mux.HandleFunc("GET /api/workspaces/{wid}/keys", s.consoleKeys)
	mux.HandleFunc("POST /api/workspaces/{wid}/keys", s.consoleKeys)
	mux.HandleFunc("DELETE /api/workspaces/{wid}/keys/{id}", s.consoleKeys)
	mux.HandleFunc("GET /api/workspaces/{wid}/channels", s.consoleChannels)
	mux.HandleFunc("PATCH /api/workspaces/{wid}/channels", s.consoleChannels)
	mux.HandleFunc("DELETE /api/workspaces/{wid}/channels", s.consoleChannels)
	mux.HandleFunc("POST /api/workspaces/{wid}/channels/models", s.consoleDiscoverModels)
	mux.HandleFunc("POST /api/workspaces/{wid}/channels/detect", s.consoleDetectChannel)
	mux.HandleFunc("POST /api/workspaces/{wid}/channels", s.consoleChannels)
	mux.HandleFunc("DELETE /api/workspaces/{wid}/channels/{id}", s.consoleChannels)
	mux.HandleFunc("GET /api/workspaces/{wid}/billing", s.consoleBilling)
	mux.HandleFunc("GET /api/workspaces/{wid}/files", s.consoleFiles)
	mux.HandleFunc("GET /api/workspaces/{wid}/files/{id}/content", s.consoleFileContent)
	mux.HandleFunc("DELETE /api/workspaces/{wid}/files/{id}", s.consoleFiles)
	mux.HandleFunc("GET /api/workspaces/{wid}/model-eval", s.consoleModelEval)
	mux.HandleFunc("GET /api/workspaces/{wid}/model-eval/{id}", s.consoleModelEval)
	mux.HandleFunc("POST /api/workspaces/{wid}/model-eval", s.consoleModelEval)
	mux.HandleFunc("DELETE /api/workspaces/{wid}/model-eval/{id}", s.consoleModelEval)
	mux.HandleFunc("POST /api/workspaces/{wid}/model-eval/run", s.consoleModelEvalRun)
	mux.HandleFunc("POST /api/user/redeem", s.consoleRedeem)
	mux.HandleFunc("GET /api/admin/redeem-codes", s.consoleAdminRedeemCodes)
	mux.HandleFunc("POST /api/admin/redeem-codes", s.consoleAdminRedeemCodes)
	mux.HandleFunc("PATCH /api/admin/redeem-codes", s.consoleAdminRedeemCodes)
	mux.HandleFunc("GET /api/admin/groups", s.consoleAdminGroups)
	mux.HandleFunc("POST /api/admin/groups", s.consoleAdminGroups)
	mux.HandleFunc("PATCH /api/admin/groups/{id}", s.consoleAdminGroups)
	mux.HandleFunc("DELETE /api/admin/groups/{id}", s.consoleAdminGroups)
	mux.HandleFunc("GET /api/admin/channels", s.consoleAdminChannels)
	mux.HandleFunc("GET /api/admin/overview", s.consoleAdminOverview)
	mux.HandleFunc("GET /api/admin/users", s.consoleAdminUsers)
	mux.HandleFunc("PATCH /api/admin/users/{id}", s.consoleAdminUsers)
	mux.HandleFunc("GET /api/admin/settings", s.consoleAdminSettings)
	mux.HandleFunc("PATCH /api/admin/settings", s.consoleAdminSettings)
	mux.HandleFunc("GET /api/admin/email-settings", s.consoleAdminEmailSettings)
	mux.HandleFunc("PATCH /api/admin/email-settings", s.consoleAdminEmailSettings)
	mux.HandleFunc("POST /api/admin/email-settings", s.consoleAdminEmailSettings)
	mux.HandleFunc("GET /api/admin/product-announcements", s.consoleAdminAnnouncements)
	mux.HandleFunc("POST /api/admin/product-announcements", s.consoleAdminAnnouncements)
	mux.HandleFunc("POST /api/admin/channels", s.consoleChannels)
	mux.HandleFunc("PATCH /api/admin/channels/{id}", s.consoleChannels)
	mux.HandleFunc("DELETE /api/admin/channels/{id}", s.consoleChannels)
	mux.HandleFunc("POST /api/admin/channels/models", s.consoleDiscoverModels)
	mux.HandleFunc("POST /api/admin/channels/detect", s.consoleDetectChannel)
	mux.HandleFunc("GET /api/admin/abilities", s.consoleAdminAbilities)
	mux.HandleFunc("GET /api/admin/pricing", s.consoleAdminPricing)
	mux.HandleFunc("PATCH /api/admin/pricing", s.consoleAdminPricing)
	mux.HandleFunc("GET /api/workspaces/{wid}/usage", s.consoleUsage)
	mux.HandleFunc("GET /api/workspaces/{wid}/balance", s.workspaceBalance)
	mux.HandleFunc("GET /api/workspaces/{wid}/routes", s.routeTraces)
	mux.HandleFunc("GET /api/workspaces/{wid}/security/decisions", s.securityDecisions)
	mux.HandleFunc("GET /api/workspaces/{wid}/security/decisions/{id}", s.securityDecision)
	mux.HandleFunc("GET /api/workspaces/{wid}/security/incidents", s.securityIncidents)
	mux.HandleFunc("PATCH /api/workspaces/{wid}/security/incidents/{id}", s.securityIncident)
	mux.HandleFunc("POST /api/workspaces/{wid}/chatgpt-subscription", s.importChatGPTSubscription)
	mux.HandleFunc("GET /api/workspaces/{wid}/chatgpt-subscription/{id}/quota", s.chatGPTQuota)
	mux.HandleFunc("POST /api/admin/workspaces/{wid}/credit", s.consoleAdminCredit)
	mux.HandleFunc("GET /v1/models", s.models)
	mux.HandleFunc("POST /v1/chat/completions", s.chat)
	mux.HandleFunc("POST /v1/responses", s.responses)
	mux.HandleFunc("POST /v1/messages", s.messages)
	mux.HandleFunc("POST /v1beta/models/{rest...}", s.geminiDispatch)
	mux.HandleFunc("POST /v1/images/generations", s.images)
	mux.HandleFunc("POST /v1/images/edits", s.images)
	mux.HandleFunc("POST /v1/systemone", s.systemone)
	mux.HandleFunc("POST /v1/videos", s.videos)
	mux.HandleFunc("GET /v1/tasks/{id}", s.task)
	mux.HandleFunc("POST /v1/files", s.uploadFile)
	mux.HandleFunc("GET /v1/files", s.listFiles)
	mux.HandleFunc("GET /v1/files/{id}", s.getFile)
	mux.HandleFunc("GET /v1/files/{id}/content", s.fileContent)
	mux.HandleFunc("DELETE /v1/files/{id}", s.deleteFile)
	mux.HandleFunc("GET /v1/me/balance", s.apiBalance)
	mux.HandleFunc("GET /v1/me/usage", s.apiUsage)
	mux.HandleFunc("GET /assets/{name...}", s.asset)
	mux.HandleFunc("GET /", s.index)
	return s.requestLog(s.securityHeaders(mux))
}
func (s *Server) requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(rw, r)
		s.Log.Info("http_request", "method", r.Method, "path", r.URL.Path, "status", rw.status, "duration_ms", time.Since(start).Milliseconds(), "remote", r.RemoteAddr)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) { w.status = code; w.ResponseWriter.WriteHeader(code) }
func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"status": "ok", "service": "capi", "time": time.Now().UTC()})
}
func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.Store.DB.PingContext(ctx); err != nil {
		s.Log.Error("readiness_failed", "error", err)
		settings := s.runtimeSettings(r.Context())
		go ops.NewAlerter(settings.AlertWebhookURL).Send(context.Background(), "readiness_failed", err.Error(), nil)
		writeJSON(w, 503, map[string]any{"status": "not_ready"})
		return
	}
	writeJSON(w, 200, map[string]any{"status": "ready", "database": "ok", "time": time.Now().UTC()})
}
func (s *Server) index(w http.ResponseWriter, r *http.Request) { webui.ServeHTTP(w, r) }
func (s *Server) asset(w http.ResponseWriter, r *http.Request) { webui.ServeHTTP(w, r) }
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func readJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 4<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}
func apiError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"type": "api_error", "code": code, "message": msg}})
}
func (s *Server) requireSession(r *http.Request) (*auth.Session, error) {
	c, err := r.Cookie("capi_session")
	if err != nil {
		return nil, err
	}
	return auth.LookupSession(r.Context(), s.Store, c.Value)
}
func (s *Server) requireWorkspaceRole(r *http.Request, wid string) (*auth.Session, string, error) {
	sess, err := s.requireSession(r)
	if err != nil {
		return nil, "", err
	}
	var role string
	err = s.Store.DB.QueryRowContext(r.Context(), `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, wid, sess.User.ID).Scan(&role)
	return sess, role, err
}
func (s *Server) requireAdmin(r *http.Request) (*auth.Session, error) {
	sess, err := s.requireSession(r)
	if err != nil {
		return nil, err
	}
	if sess.User.Role != "admin" {
		return nil, errors.New("admin required")
	}
	return sess, nil
}
func (s *Server) sameOrigin(r *http.Request) bool {
	return true
}
func scanNullString(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	x := v.String
	return &x
}
func must(err error) {
	if err != nil {
		panic(fmt.Sprintf("capi: %v", err))
	}
}
