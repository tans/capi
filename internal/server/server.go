package server

import(
	"context";"database/sql";"encoding/json";"errors";"fmt";"io";"log/slog";"mime";"net/http";"path/filepath";"strings";"time"
	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/ops"
	"github.com/tans/capi/internal/policy"
	"github.com/tans/capi/internal/router"
	"github.com/tans/capi/internal/redact"
	"github.com/tans/capi/internal/store"
	"github.com/tans/capi/internal/webui"
)
type Server struct{Cfg config.Config;Store *store.Store;Router *router.Router;Policy *policy.Engine;Redact *redact.Engine;Log *slog.Logger;Alert *ops.Alerter;HTTP *http.Client}
func New(cfg config.Config,st *store.Store,log *slog.Logger)*Server{return &Server{Cfg:cfg,Store:st,Router:router.New(),Policy:policy.New(cfg.JEVURL),Redact:redact.New(filepath.Join(cfg.DataDir,"redact.key")),Log:log,Alert:ops.NewAlerter(cfg.AlertWebhookURL),HTTP:&http.Client{Timeout:cfg.RelayTimeout}}}
func(s *Server)Handler()http.Handler{
	mux:=http.NewServeMux()
	mux.HandleFunc("GET /api/healthz",s.health);mux.HandleFunc("GET /api/readyz",s.ready)
	mux.HandleFunc("POST /api/auth/register",s.register);mux.HandleFunc("POST /api/auth/login",s.login);mux.HandleFunc("POST /api/auth/logout",s.logout);mux.HandleFunc("GET /api/auth/me",s.me)
	mux.HandleFunc("GET /api/workspaces",s.listWorkspaces);mux.HandleFunc("GET /api/workspaces/{wid}/keys",s.listKeys);mux.HandleFunc("POST /api/workspaces/{wid}/keys",s.createKey);mux.HandleFunc("DELETE /api/workspaces/{wid}/keys/{id}",s.deleteKey)
	mux.HandleFunc("GET /api/workspaces/{wid}/channels",s.listChannels);mux.HandleFunc("POST /api/workspaces/{wid}/channels",s.createChannel);mux.HandleFunc("DELETE /api/workspaces/{wid}/channels/{id}",s.deleteChannel)
	mux.HandleFunc("GET /api/workspaces/{wid}/usage",s.workspaceUsage);mux.HandleFunc("GET /api/workspaces/{wid}/balance",s.workspaceBalance);mux.HandleFunc("GET /api/workspaces/{wid}/routes",s.routeTraces);mux.HandleFunc("POST /api/admin/channels",s.adminCreateChannel);mux.HandleFunc("POST /api/admin/workspaces/{wid}/credit",s.adminCredit)
	mux.HandleFunc("GET /v1/models",s.models);mux.HandleFunc("POST /v1/chat/completions",s.chat);mux.HandleFunc("POST /v1/responses",s.responses);mux.HandleFunc("POST /v1/messages",s.messages)
	mux.HandleFunc("POST /v1/images/generations",s.images);mux.HandleFunc("POST /v1/images/edits",s.images);mux.HandleFunc("POST /v1/evaluate",s.evaluate);mux.HandleFunc("POST /v1/systemone",s.systemone);mux.HandleFunc("POST /v1/videos",s.videos);mux.HandleFunc("GET /v1/tasks/{id}",s.task)
	mux.HandleFunc("POST /v1/files",s.uploadFile);mux.HandleFunc("GET /v1/files",s.listFiles);mux.HandleFunc("GET /v1/files/{id}",s.getFile);mux.HandleFunc("GET /v1/files/{id}/content",s.fileContent);mux.HandleFunc("DELETE /v1/files/{id}",s.deleteFile);mux.HandleFunc("GET /v1/me/balance",s.apiBalance);mux.HandleFunc("GET /v1/me/usage",s.apiUsage)
	mux.HandleFunc("GET /assets/{name}",s.asset);mux.HandleFunc("GET /",s.index)
	return s.requestLog(s.securityHeaders(mux))
}
func(s *Server)requestLog(next http.Handler)http.Handler{return http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){start:=time.Now();rw:=&statusWriter{ResponseWriter:w,status:200};next.ServeHTTP(rw,r);s.Log.Info("http_request","method",r.Method,"path",r.URL.Path,"status",rw.status,"duration_ms",time.Since(start).Milliseconds(),"remote",r.RemoteAddr)})}
type statusWriter struct{http.ResponseWriter;status int}
func(w *statusWriter)WriteHeader(code int){w.status=code;w.ResponseWriter.WriteHeader(code)}
func(w *statusWriter)Flush(){if f,ok:=w.ResponseWriter.(http.Flusher);ok{f.Flush()}}
func(s *Server)securityHeaders(next http.Handler)http.Handler{return http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){w.Header().Set("X-Content-Type-Options","nosniff");w.Header().Set("X-Frame-Options","DENY");w.Header().Set("Referrer-Policy","same-origin");next.ServeHTTP(w,r)})}
func(s *Server)health(w http.ResponseWriter,r *http.Request){writeJSON(w,200,map[string]any{"status":"ok","service":"capi","time":time.Now().UTC()})}
func(s *Server)ready(w http.ResponseWriter,r *http.Request){ctx,cancel:=context.WithTimeout(r.Context(),2*time.Second);defer cancel();if err:=s.Store.DB.PingContext(ctx);err!=nil{s.Log.Error("readiness_failed","error",err);go s.Alert.Send(context.Background(),"readiness_failed",err.Error(),nil);writeJSON(w,503,map[string]any{"status":"not_ready"});return};writeJSON(w,200,map[string]any{"status":"ready","database":"ok","time":time.Now().UTC()})}
func(s *Server)index(w http.ResponseWriter,r *http.Request){if r.URL.Path!="/"&&r.URL.Path!="/dashboard"&&r.URL.Path!="/models"&&r.URL.Path!="/docs"{http.NotFound(w,r);return};b,err:=webui.Assets.ReadFile("assets/index.html");if err!=nil{http.Error(w,"ui unavailable",500);return};w.Header().Set("Content-Type","text/html; charset=utf-8");w.Write(b)}
func(s *Server)asset(w http.ResponseWriter,r *http.Request){name:=filepath.Base(r.PathValue("name"));b,err:=webui.Assets.ReadFile("assets/"+name);if err!=nil{http.NotFound(w,r);return};if ct:=mime.TypeByExtension(filepath.Ext(name));ct!=""{w.Header().Set("Content-Type",ct)};w.Header().Set("Cache-Control","public,max-age=3600");w.Write(b)}
func writeJSON(w http.ResponseWriter,status int,v any){w.Header().Set("Content-Type","application/json");w.WriteHeader(status);_=json.NewEncoder(w).Encode(v)}
func readJSON(r *http.Request,v any)error{dec:=json.NewDecoder(io.LimitReader(r.Body,4<<20));dec.DisallowUnknownFields();return dec.Decode(v)}
func apiError(w http.ResponseWriter,status int,code,msg string){writeJSON(w,status,map[string]any{"error":map[string]any{"type":"api_error","code":code,"message":msg}})}
func(s *Server)requireSession(r *http.Request)(*auth.Session,error){c,err:=r.Cookie("capi_session");if err!=nil{return nil,err};return auth.LookupSession(r.Context(),s.Store,c.Value)}
func(s *Server)requireWorkspaceRole(r *http.Request,wid string)(*auth.Session,string,error){sess,err:=s.requireSession(r);if err!=nil{return nil,"",err};var role string;err=s.Store.DB.QueryRowContext(r.Context(),`SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`,wid,sess.User.ID).Scan(&role);return sess,role,err}
func(s *Server)requireAdmin(r *http.Request)(*auth.Session,error){sess,err:=s.requireSession(r);if err!=nil{return nil,err};if sess.User.Role!="admin"{return nil,errors.New("admin required")};return sess,nil}
func(s *Server)sameOrigin(r *http.Request)bool{if r.Method==http.MethodGet||r.Method==http.MethodHead{return true};origin:=strings.TrimSpace(r.Header.Get("Origin"));if origin==""{return true};for _,allowed:=range s.Cfg.TrustedOrigins{if strings.EqualFold(origin,allowed){return true}};hostOrigin:="http://"+r.Host;if r.TLS!=nil{hostOrigin="https://"+r.Host};return strings.EqualFold(origin,hostOrigin)}
func scanNullString(v sql.NullString)*string{if !v.Valid{return nil};x:=v.String;return &x}
func must(err error){if err!=nil{panic(fmt.Sprintf("capi: %v",err))}}
