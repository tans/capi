package server

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/protocol"
	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/router"
)

type APIKey struct{ID,WorkspaceID,Name,Scopes string}
func(k APIKey)Has(scope string)bool{for _,v:=range strings.Split(k.Scopes,","){if strings.TrimSpace(v)==scope||strings.TrimSpace(v)=="*"{return true}};return false}
func(s *Server)authenticateAPI(r *http.Request,scope string)(APIKey,error){
	token:=strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"),"Bearer "));if token==""{token=strings.TrimSpace(r.Header.Get("x-goog-api-key"))};if token==""{token=strings.TrimSpace(r.URL.Query().Get("key"))};if token==""{return APIKey{},fmt.Errorf("missing api key")}
	var k APIKey;var enabled int
	err:=s.Store.DB.QueryRowContext(r.Context(),`SELECT id,workspace_id,name,scopes,enabled FROM api_keys WHERE key_hash=?`,auth.HashToken(token)).Scan(&k.ID,&k.WorkspaceID,&k.Name,&k.Scopes,&enabled)
	if err!=nil||enabled!=1{return APIKey{},fmt.Errorf("invalid api key")};if scope!=""&&!k.Has(scope){return APIKey{},fmt.Errorf("missing scope %s",scope)}
	_,_=s.Store.DB.ExecContext(r.Context(),`UPDATE api_keys SET last_used_at=? WHERE id=?`,time.Now().UTC().Format(time.RFC3339Nano),k.ID);return k,nil
}

func(s *Server)register(w http.ResponseWriter,r *http.Request){
	if !s.sameOrigin(r){apiError(w,403,"bad_origin","Origin is not allowed.");return}
	var in struct{Name string `json:"name"`;Email string `json:"email"`;Password string `json:"password"`}
	if err:=readJSON(r,&in);err!=nil{apiError(w,400,"invalid_json","Invalid request body.");return};in.Email=strings.ToLower(strings.TrimSpace(in.Email));if in.Email==""||!strings.Contains(in.Email,"@"){apiError(w,400,"invalid_email","Valid email required.");return}
	hash,err:=auth.HashPassword(in.Password);if err!=nil{apiError(w,400,"weak_password",err.Error());return};if strings.TrimSpace(in.Name)==""{in.Name=strings.Split(in.Email,"@")[0]}
	uid,wid:=auth.RandomID("usr_"),auth.RandomID("ws_");role:="user";if s.Cfg.AdminEmail!=""&&in.Email==s.Cfg.AdminEmail{role="admin"};now:=time.Now().UTC().Format(time.RFC3339Nano)
	tx,err:=s.Store.DB.BeginTx(r.Context(),nil);if err!=nil{apiError(w,500,"database_error",err.Error());return};defer tx.Rollback()
	if _,err=tx.ExecContext(r.Context(),`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)`,uid,in.Email,in.Name,hash,role,now);err!=nil{if strings.Contains(strings.ToLower(err.Error()),"unique"){apiError(w,409,"email_exists","Email already exists.");return};apiError(w,500,"database_error",err.Error());return}
	_,err=tx.ExecContext(r.Context(),`INSERT INTO workspaces(id,name,kind,created_at) VALUES(?,?,?,?)`,wid,in.Name+" Workspace","personal",now);if err==nil{_,err=tx.ExecContext(r.Context(),`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?)`,wid,uid,"owner",now)};if err==nil{_,err=tx.ExecContext(r.Context(),`INSERT INTO wallets(workspace_id,balance_micros,currency,updated_at) VALUES(?,?,?,?)`,wid,0,"USD",now)};if err!=nil{apiError(w,500,"database_error",err.Error());return};if err=tx.Commit();err!=nil{apiError(w,500,"database_error",err.Error());return}
	token,expires,err:=auth.CreateSession(r.Context(),s.Store,uid);if err!=nil{apiError(w,500,"session_error",err.Error());return};s.setSessionCookie(w,token,expires);writeJSON(w,201,map[string]any{"user":map[string]any{"id":uid,"email":in.Email,"name":in.Name,"role":role},"workspace_id":wid})
}
func(s *Server)login(w http.ResponseWriter,r *http.Request){
	if !s.sameOrigin(r){apiError(w,403,"bad_origin","Origin is not allowed.");return}
	var in struct{Email string `json:"email"`;Password string `json:"password"`}
	if readJSON(r,&in)!=nil{apiError(w,400,"invalid_json","Invalid request body.");return}
	var uid,hash string
	err:=s.Store.DB.QueryRowContext(r.Context(),`SELECT id,password_hash FROM users WHERE email=?`,strings.ToLower(strings.TrimSpace(in.Email))).Scan(&uid,&hash)
	if err!=nil||!auth.CheckPassword(hash,in.Password){apiError(w,401,"invalid_credentials","Invalid email or password.");return}
	if strings.HasPrefix(hash,"$argon2id$"){
		if upgraded,err:=auth.HashPassword(in.Password);err==nil{
			if _,err=s.Store.DB.ExecContext(r.Context(),`UPDATE users SET password_hash=? WHERE id=? AND password_hash=?`,upgraded,uid,hash);err!=nil{apiError(w,500,"database_error","Could not upgrade password.");return}
		}
	}
	token,expires,err:=auth.CreateSession(r.Context(),s.Store,uid)
	if err!=nil{apiError(w,500,"session_error",err.Error());return}
	s.setSessionCookie(w,token,expires);writeJSON(w,200,map[string]any{"ok":true})
}
func(s *Server)setSessionCookie(w http.ResponseWriter,token string,expires time.Time){http.SetCookie(w,&http.Cookie{Name:"capi_session",Value:token,Path:"/",HttpOnly:true,Secure:strings.HasPrefix(s.Cfg.PublicBaseURL,"https://"),SameSite:http.SameSiteLaxMode,Expires:expires})}
func(s *Server)logout(w http.ResponseWriter,r *http.Request){if c,err:=r.Cookie("capi_session");err==nil{auth.DeleteSession(r.Context(),s.Store,c.Value)};http.SetCookie(w,&http.Cookie{Name:"capi_session",Value:"",Path:"/",MaxAge:-1,HttpOnly:true});writeJSON(w,200,map[string]any{"ok":true})}
func(s *Server)me(w http.ResponseWriter,r *http.Request){sess,err:=s.requireSession(r);if err!=nil{apiError(w,401,"unauthorized","Sign in required.");return};writeJSON(w,200,map[string]any{"user":sess.User,"expires_at":sess.ExpiresAt})}

func(s *Server)listWorkspaces(w http.ResponseWriter,r *http.Request){sess,err:=s.requireSession(r);if err!=nil{apiError(w,401,"unauthorized","Sign in required.");return};rows,err:=s.Store.DB.QueryContext(r.Context(),`SELECT w.id,w.name,w.kind,m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.created_at`,sess.User.ID);if err!=nil{apiError(w,500,"database_error",err.Error());return};defer rows.Close();var data []map[string]any;for rows.Next(){var id,name,kind,role string;if rows.Scan(&id,&name,&kind,&role)==nil{data=append(data,map[string]any{"id":id,"name":name,"kind":kind,"role":role})}};writeJSON(w,200,map[string]any{"data":data})}
func(s *Server)listKeys(w http.ResponseWriter,r *http.Request){wid:=r.PathValue("wid");if _,_,err:=s.requireWorkspaceRole(r,wid);err!=nil{apiError(w,403,"forbidden","Workspace access required.");return};rows,err:=s.Store.DB.QueryContext(r.Context(),`SELECT id,name,key_prefix,secret,scopes,enabled,created_at,last_used_at FROM api_keys WHERE workspace_id=? ORDER BY created_at DESC`,wid);if err!=nil{apiError(w,500,"database_error",err.Error());return};defer rows.Close();var data []map[string]any;for rows.Next(){var id,name,prefix,secret,scopes,created string;var enabled int;var last sql.NullString;if rows.Scan(&id,&name,&prefix,&secret,&scopes,&enabled,&created,&last)==nil{data=append(data,map[string]any{"id":id,"name":name,"prefix":prefix,"secret":secret,"scopes":strings.Split(scopes,","),"enabled":enabled==1,"created_at":created,"last_used_at":scanNullString(last)})}};writeJSON(w,200,map[string]any{"data":data})}
func(s *Server)createKey(w http.ResponseWriter,r *http.Request){wid:=r.PathValue("wid");_,role,err:=s.requireWorkspaceRole(r,wid);if err!=nil||(role!="owner"&&role!="admin"){apiError(w,403,"forbidden","Workspace admin required.");return};var in struct{Name string `json:"name"`;Scopes []string `json:"scopes"`};if readJSON(r,&in)!=nil{apiError(w,400,"invalid_json","Invalid request body.");return};if in.Name==""{in.Name="Default"};if len(in.Scopes)==0{in.Scopes=[]string{"llm.chat","llm.evaluate","image.generate","video.generate","files.write","billing.read"}};secret:=auth.RandomToken("capi_sk_live_");id:=auth.RandomID("key_");prefix:=secret;if len(prefix)>18{prefix=prefix[:18]};now:=time.Now().UTC().Format(time.RFC3339Nano);_,err=s.Store.DB.ExecContext(r.Context(),`INSERT INTO api_keys(id,workspace_id,name,key_hash,key_prefix,secret,scopes,enabled,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,id,wid,in.Name,auth.HashToken(secret),prefix,secret,strings.Join(in.Scopes,","),1,now);if err!=nil{apiError(w,500,"database_error",err.Error());return};writeJSON(w,201,map[string]any{"id":id,"name":in.Name,"secret":secret,"prefix":prefix,"scopes":in.Scopes})}
func(s *Server)deleteKey(w http.ResponseWriter,r *http.Request){wid:=r.PathValue("wid");if _,_,err:=s.requireWorkspaceRole(r,wid);err!=nil{apiError(w,403,"forbidden","Workspace access required.");return};_,err:=s.Store.DB.ExecContext(r.Context(),`DELETE FROM api_keys WHERE id=? AND workspace_id=?`,r.PathValue("id"),wid);if err!=nil{apiError(w,500,"database_error",err.Error());return};writeJSON(w,200,map[string]any{"ok":true})}

func(s *Server)listChannels(w http.ResponseWriter,r *http.Request){wid:=r.PathValue("wid");if _,_,err:=s.requireWorkspaceRole(r,wid);err!=nil{apiError(w,403,"forbidden","Workspace access required.");return};rows,err:=s.Store.DB.QueryContext(r.Context(),`SELECT id,name,protocol,base_url,api_key,models_json,priority,weight,enabled FROM channels WHERE workspace_id=? ORDER BY priority DESC,created_at`,wid);if err!=nil{apiError(w,500,"database_error",err.Error());return};defer rows.Close();var data []map[string]any;for rows.Next(){var id,name,protocolName,base,key,modelsJSON string;var priority,weight,enabled int;if rows.Scan(&id,&name,&protocolName,&base,&key,&modelsJSON,&priority,&weight,&enabled)==nil{var models []string;_=json.Unmarshal([]byte(modelsJSON),&models);data=append(data,map[string]any{"id":id,"name":name,"protocol":protocolName,"base_url":base,"api_key":key,"models":models,"priority":priority,"weight":weight,"enabled":enabled==1})}};writeJSON(w,200,map[string]any{"data":data})}
func(s *Server)createChannel(w http.ResponseWriter,r *http.Request){wid:=r.PathValue("wid");if _,_,err:=s.requireWorkspaceRole(r,wid);err!=nil{apiError(w,403,"forbidden","Workspace access required.");return};c,ok:=s.decodeChannel(w,r,&wid);if !ok{return};if err:=provider.Create(r.Context(),s.Store,c);err!=nil{apiError(w,500,"database_error",err.Error());return};writeJSON(w,201,map[string]any{"id":c.ID})}
func(s *Server)deleteChannel(w http.ResponseWriter,r *http.Request){wid:=r.PathValue("wid");if _,_,err:=s.requireWorkspaceRole(r,wid);err!=nil{apiError(w,403,"forbidden","Workspace access required.");return};_,err:=s.Store.DB.ExecContext(r.Context(),`DELETE FROM channels WHERE id=? AND workspace_id=?`,r.PathValue("id"),wid);if err!=nil{apiError(w,500,"database_error",err.Error());return};writeJSON(w,200,map[string]any{"ok":true})}
func(s *Server)adminCreateChannel(w http.ResponseWriter,r *http.Request){if _,err:=s.requireAdmin(r);err!=nil{apiError(w,403,"forbidden","Admin access required.");return};c,ok:=s.decodeChannel(w,r,nil);if !ok{return};if err:=provider.Create(r.Context(),s.Store,c);err!=nil{apiError(w,500,"database_error",err.Error());return};writeJSON(w,201,map[string]any{"id":c.ID})}
func(s *Server)decodeChannel(w http.ResponseWriter,r *http.Request,wid *string)(provider.Channel,bool){
	var in struct{Name string `json:"name"`;Protocol string `json:"protocol"`;BaseURL string `json:"base_url"`;APIKey string `json:"api_key"`;Models []string `json:"models"`;Priority int `json:"priority"`;Weight int `json:"weight"`;Enabled *bool `json:"enabled"`}
	if readJSON(r,&in)!=nil||in.Name==""||in.BaseURL==""{apiError(w,400,"invalid_channel","name and base_url are required.");return provider.Channel{},false}
	if in.Protocol==""{in.Protocol="openai"};if in.Weight<1{in.Weight=1}
	if len(in.Models)==0{
		discovered,_,err:=provider.DiscoverModels(r.Context(),in.BaseURL,in.APIKey)
		if err!=nil{apiError(w,400,"model_discovery_failed",err.Error());return provider.Channel{},false}
		for _,m:=range discovered{in.Models=append(in.Models,m.ID)}
	}
	enabled:=true;if in.Enabled!=nil{enabled=*in.Enabled}
	return provider.Channel{ID:auth.RandomID("chn_"),WorkspaceID:wid,Name:in.Name,Protocol:in.Protocol,BaseURL:in.BaseURL,APIKey:in.APIKey,Models:in.Models,Priority:in.Priority,Weight:in.Weight,Enabled:enabled},true
}

func(s *Server)workspaceUsage(w http.ResponseWriter,r *http.Request){wid:=r.PathValue("wid");if _,_,err:=s.requireWorkspaceRole(r,wid);err!=nil{apiError(w,403,"forbidden","Workspace access required.");return};s.writeUsage(w,r,wid)}
func(s *Server)writeUsage(w http.ResponseWriter,r *http.Request,wid string){
	rows,err:=s.Store.DB.QueryContext(r.Context(),`SELECT id,requested_model,routed_model,served_model,endpoint,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,reasoning_tokens,cost_micros,latency_ms,ttft_ms,status,affinity_key,created_at FROM usage_records WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100`,wid)
	if err!=nil{apiError(w,500,"database_error",err.Error());return};defer rows.Close()
	var data []map[string]any
	for rows.Next(){
		var id,requested,routed,served,endpoint,affinity,created string;var in,out,cacheRead,cacheWrite,reasoning,cost,latency,ttft int64;var status int
		if rows.Scan(&id,&requested,&routed,&served,&endpoint,&in,&out,&cacheRead,&cacheWrite,&reasoning,&cost,&latency,&ttft,&status,&affinity,&created)==nil{
			data=append(data,map[string]any{"id":id,"requested_model":requested,"routed_model":routed,"served_model":served,"endpoint":endpoint,"input_tokens":in,"output_tokens":out,"cache_read_tokens":cacheRead,"cache_write_tokens":cacheWrite,"reasoning_tokens":reasoning,"cost_micros":cost,"latency_ms":latency,"ttft_ms":ttft,"status":status,"affinity_key":affinity,"created_at":created})
		}
	}
	writeJSON(w,200,map[string]any{"data":data})
}
func(s *Server)workspaceBalance(w http.ResponseWriter,r *http.Request){wid:=r.PathValue("wid");if _,_,err:=s.requireWorkspaceRole(r,wid);err!=nil{apiError(w,403,"forbidden","Workspace access required.");return};s.writeBalance(w,r,wid)}
func(s *Server)writeBalance(w http.ResponseWriter,r *http.Request,wid string){var balance int64;var currency string;if err:=s.Store.DB.QueryRowContext(r.Context(),`SELECT balance_micros,currency FROM wallets WHERE workspace_id=?`,wid).Scan(&balance,&currency);err!=nil{apiError(w,404,"not_found","Wallet not found.");return};writeJSON(w,200,map[string]any{"balance":map[string]any{"micros":balance,"amount":float64(balance)/1_000_000,"currency":currency}})}
func(s *Server)adminCredit(w http.ResponseWriter,r *http.Request){if _,err:=s.requireAdmin(r);err!=nil{apiError(w,403,"forbidden","Admin required.");return};var in struct{Micros int64 `json:"micros"`};if readJSON(r,&in)!=nil{apiError(w,400,"invalid_json","Invalid request.");return};_,err:=s.Store.DB.ExecContext(r.Context(),`UPDATE wallets SET balance_micros=balance_micros+?,updated_at=? WHERE workspace_id=?`,in.Micros,time.Now().UTC().Format(time.RFC3339Nano),r.PathValue("wid"));if err!=nil{apiError(w,500,"database_error",err.Error());return};s.writeBalance(w,r,r.PathValue("wid"))}

func(s *Server)models(w http.ResponseWriter,r *http.Request){
	k,err:=s.authenticateAPI(r,"");if err!=nil{apiError(w,401,"unauthorized",err.Error());return}
	models,err:=provider.ListModels(r.Context(),s.Store,k.WorkspaceID);if err!=nil{apiError(w,500,"database_error",err.Error());return}
	data:=make([]map[string]any,0,len(models));for _,m:=range models{data=append(data,map[string]any{"id":m,"object":"model","owned_by":"capi"})}
	writeJSON(w,200,map[string]any{"object":"list","data":data})
}
func(s *Server)chat(w http.ResponseWriter,r *http.Request){s.relay(w,r,"llm.chat","/v1/chat/completions")}
func(s *Server)responses(w http.ResponseWriter,r *http.Request){s.relay(w,r,"llm.chat","/v1/responses")}
func(s *Server)images(w http.ResponseWriter,r *http.Request){
	if strings.HasPrefix(r.Header.Get("Content-Type"),"multipart/form-data"){s.relayMultipart(w,r,"image.generate",r.URL.Path);return}
	s.relay(w,r,"image.generate",r.URL.Path)
}
func(s *Server)evaluate(w http.ResponseWriter,r *http.Request){s.relay(w,r,"llm.evaluate","/v1/evaluate")}
func(s *Server)systemone(w http.ResponseWriter,r *http.Request){s.relay(w,r,"llm.evaluate","/v1/systemone")}
func(s *Server)messages(w http.ResponseWriter,r *http.Request){
	k,err:=s.authenticateAPI(r,"llm.chat");if err!=nil{apiError(w,401,"unauthorized",err.Error());return}
	raw,_:=io.ReadAll(io.LimitReader(r.Body,16<<20));var probe struct{Model string `json:"model"`;Stream bool `json:"stream"`}
	if json.Unmarshal(raw,&probe)!=nil||probe.Model==""{apiError(w,400,"invalid_request","model is required.");return}
	if s.Cfg.Redact{raw=s.Redact.MaskBytes(raw)}
	s.handleAnthropic(w,r,raw,k,probe.Model,probe.Stream)
}

type relayMeta struct{Channel provider.Channel;Status int;Latency time.Duration;TTFT time.Duration;Usage protocol.Usage;ServedModel string;Affinity string}

func(s *Server)relay(w http.ResponseWriter,r *http.Request,scope,path string){
	k,err:=s.authenticateAPI(r,scope);if err!=nil{apiError(w,401,"unauthorized",err.Error());return}
	raw,_:=io.ReadAll(io.LimitReader(r.Body,32<<20))
	var probe struct{Model string `json:"model"`;Stream bool `json:"stream"`;PromptCacheKey string `json:"prompt_cache_key"`;Input json.RawMessage `json:"input"`;PreviousResponseID string `json:"previous_response_id"`}
	if json.Unmarshal(raw,&probe)!=nil||probe.Model==""{apiError(w,400,"invalid_request","model is required.");return}
	if path=="/v1/responses" && probe.PreviousResponseID=="" && (len(probe.Input)==0 || bytes.Equal(bytes.TrimSpace(probe.Input),[]byte("null"))){apiError(w,400,"invalid_request","input is required.");return}
	requested:=probe.Model
	if s.Cfg.Redact{raw=s.Redact.MaskBytes(raw)}
	dec:=s.Policy.Apply(r.Context(),raw,probe.Model,false);if !dec.Allow{apiError(w,403,"policy_blocked",dec.Reason);return}
	routed:=dec.Model;if routed==""{routed=requested}
	body:=dec.Body
	if routed!=requested{body=rewriteJSONModel(body,routed)}
	affinity:=strings.TrimSpace(r.Header.Get("X-CAPI-Session"));if affinity==""{affinity=probe.PromptCacheKey}
	if probe.Stream{
		if err:=s.relayStream(w,r,k,requested,routed,path,body,affinity);err!=nil{apiError(w,502,"upstream_error",err.Error())}
		return
	}
	result,_,err:=s.relayBufferedDetailed(r,k,requested,routed,path,body,affinity)
	if err!=nil{apiError(w,502,"upstream_error",err.Error());return}
	if s.Cfg.Redact{result=s.Redact.RestoreBytes(result)}
	w.Header().Set("Content-Type","application/json");w.Write(result)
}

func(s *Server)relayMultipart(w http.ResponseWriter,r *http.Request,scope,path string){
	k,err:=s.authenticateAPI(r,scope);if err!=nil{apiError(w,401,"unauthorized",err.Error());return}
	raw,_:=io.ReadAll(io.LimitReader(r.Body,40<<20));model,err:=multipartModel(raw,r.Header.Get("Content-Type"));if err!=nil||model==""{apiError(w,400,"invalid_request","multipart model field is required.");return}
	result,_,err:=s.relayBufferedDetailed(r,k,model,model,path,raw,"");if err!=nil{apiError(w,502,"upstream_error",err.Error());return}
	w.Header().Set("Content-Type","application/json");w.Write(result)
}
func multipartModel(raw []byte,contentType string)(string,error){
	_,params,err:=mime.ParseMediaType(contentType);if err!=nil{return"",err};boundary:=params["boundary"];if boundary==""{return"",fmt.Errorf("missing boundary")}
	mr:=multipart.NewReader(bytes.NewReader(raw),boundary)
	for{p,err:=mr.NextPart();if err==io.EOF{break};if err!=nil{return"",err};if p.FormName()=="model"{b,_:=io.ReadAll(io.LimitReader(p,1024));return strings.TrimSpace(string(b)),nil}}
	return"",fmt.Errorf("model field not found")
}
func rewriteJSONModel(body []byte,model string)[]byte{
	var v map[string]any;if json.Unmarshal(body,&v)!=nil{return body};v["model"]=model;b,err:=json.Marshal(v);if err!=nil{return body};return b
}
func affinityKey(workspace,key string)string{if key==""{return""};return workspace+":"+key}
func upstreamURL(base,path string)string{base=strings.TrimRight(base,"/");if strings.HasSuffix(base,"/v1")&&strings.HasPrefix(path,"/v1/"){return base+strings.TrimPrefix(path,"/v1")};return base+path}

func(s *Server)relayBufferedDetailed(r *http.Request,k APIKey,requested,routed,path string,body []byte,affinity string)([]byte,relayMeta,error){
	channels,err:=provider.Accessible(r.Context(),s.Store,k.WorkspaceID,routed);if err!=nil||len(channels)==0{return nil,relayMeta{},fmt.Errorf("no channel serves model %q",routed)}
	trace:=router.Trace{Time:time.Now(),Workspace:k.WorkspaceID,Affinity:affinity,Model:requested};for _,c:=range channels{trace.Order=append(trace.Order,c.ID)}
	remaining:=append([]provider.Channel(nil),channels...);aKey:=affinityKey(k.WorkspaceID,affinity)
	for len(remaining)>0{
		ch,err:=s.Router.ChooseFor(remaining,aKey);if err!=nil{break}
		if ch.Protocol=="chatgpt-subscription"{remaining=removeChannel(remaining,ch.ID);continue}
		requestBody:=body
		requestPath:=path
		var req *http.Request
		if (ch.Protocol=="anthropic"||ch.Protocol=="gemini")&&path=="/v1/chat/completions"{
			requestBody,requestPath,err=adaptRequest("openai",ch.Protocol,routed,body,false);if err!=nil{remaining=removeChannel(remaining,ch.ID);continue}
			req,err=s.newProtocolRequest(r.Context(),ch,routed,requestPath,requestBody,false)
		}else{
			req,err=http.NewRequestWithContext(r.Context(),http.MethodPost,upstreamURL(ch.BaseURL,path),bytes.NewReader(body))
			if err==nil{ct:=r.Header.Get("Content-Type");if ct==""{ct="application/json"};req.Header.Set("Content-Type",ct);if ch.APIKey!=""{req.Header.Set("Authorization","Bearer "+ch.APIKey)}}
		}
		if err!=nil{return nil,relayMeta{},err}
		started:=time.Now();res,err:=s.HTTP.Do(req)
		if err!=nil{s.Router.Rest(ch.ID,"network",0,time.Minute);trace.Tries=append(trace.Tries,router.Try{Channel:ch.ID,Reason:"network",Millis:time.Since(started).Milliseconds()});remaining=removeChannel(remaining,ch.ID);continue}
		rb,_:=io.ReadAll(io.LimitReader(res.Body,64<<20));res.Body.Close();lat:=time.Since(started)
		trace.Tries=append(trace.Tries,router.Try{Channel:ch.ID,Status:res.StatusCode,Millis:lat.Milliseconds()})
		if res.StatusCode>=200&&res.StatusCode<400{
			if ch.Protocol=="anthropic"||ch.Protocol=="gemini"{converted,convErr:=responseToOpenAI(ch.Protocol,rb);if convErr!=nil{return nil,relayMeta{},convErr};rb=converted}
			s.Router.Clear(ch.ID);trace.Selected=ch.ID;s.Router.AddTrace(trace)
			usage,served:=usageFromBody(rb);meta:=relayMeta{Channel:ch,Status:res.StatusCode,Latency:lat,Usage:usage,ServedModel:served,Affinity:affinity}
			s.recordUsageDetailed(r,k,ch,requested,routed,served,path,res.StatusCode,usage,lat,0,affinity)
			return rb,meta,nil
		}
		reason,d:=router.ClassifyFailure(res.StatusCode,res.Header,rb);if d>0{s.Router.Rest(ch.ID,reason,res.StatusCode,d)};trace.Tries[len(trace.Tries)-1].Reason=reason;remaining=removeChannel(remaining,ch.ID)
	}
	s.Router.AddTrace(trace);return nil,relayMeta{},fmt.Errorf("all channels failed")
}

func(s *Server)relayStream(w http.ResponseWriter,r *http.Request,k APIKey,requested,routed,path string,body []byte,affinity string)error{
	channels,err:=provider.Accessible(r.Context(),s.Store,k.WorkspaceID,routed);if err!=nil||len(channels)==0{return fmt.Errorf("no channel serves model %q",routed)}
	trace:=router.Trace{Time:time.Now(),Workspace:k.WorkspaceID,Affinity:affinity,Model:requested};for _,c:=range channels{trace.Order=append(trace.Order,c.ID)}
	remaining:=append([]provider.Channel(nil),channels...);aKey:=affinityKey(k.WorkspaceID,affinity)
	for len(remaining)>0{
		ch,err:=s.Router.ChooseFor(remaining,aKey);if err!=nil{break}
		requestBody:=body
		requestURL:=upstreamURL(ch.BaseURL,path)
		nativeBridge:=false
		var req *http.Request
		if (ch.Protocol=="anthropic"||ch.Protocol=="gemini")&&path=="/v1/chat/completions"{
			var nativePath string
			requestBody,nativePath,err=adaptRequest("openai",ch.Protocol,routed,body,true);if err!=nil{remaining=removeChannel(remaining,ch.ID);continue}
			req,err=s.newProtocolRequest(r.Context(),ch,routed,nativePath,requestBody,true);nativeBridge=true
		}
		if ch.Protocol=="chatgpt-subscription"{
			if path!="/v1/responses"{remaining=removeChannel(remaining,ch.ID);continue}
			requestBody,err=codexBody(body);if err!=nil{remaining=removeChannel(remaining,ch.ID);continue}
			requestURL=provider.CodexBase+"/responses"
		}
		if req==nil{req,err=http.NewRequestWithContext(r.Context(),http.MethodPost,requestURL,bytes.NewReader(requestBody));if err!=nil{return err};req.Header.Set("Content-Type","application/json")}
		if ch.Protocol=="chatgpt-subscription"{
			updated,signErr:=provider.SignCodexRequest(req,[]byte(ch.APIKey));if signErr!=nil{s.Router.Rest(ch.ID,"auth",401,10*time.Minute);remaining=removeChannel(remaining,ch.ID);continue}
			if len(updated)>0&&string(updated)!=ch.APIKey{_,_=s.Store.DB.ExecContext(r.Context(),`UPDATE channels SET api_key=?,updated_at=? WHERE id=?`,string(updated),time.Now().UTC().Format(time.RFC3339Nano),ch.ID)}
		}else if !nativeBridge&&ch.APIKey!=""{req.Header.Set("Authorization","Bearer "+ch.APIKey)}
		started:=time.Now();res,err:=s.HTTP.Do(req)
		if err!=nil{s.Router.Rest(ch.ID,"network",0,time.Minute);trace.Tries=append(trace.Tries,router.Try{Channel:ch.ID,Reason:"network",Millis:time.Since(started).Milliseconds()});remaining=removeChannel(remaining,ch.ID);continue}
		if res.StatusCode<200||res.StatusCode>=400{rb,_:=io.ReadAll(io.LimitReader(res.Body,8<<20));res.Body.Close();reason,d:=router.ClassifyFailure(res.StatusCode,res.Header,rb);if d>0{s.Router.Rest(ch.ID,reason,res.StatusCode,d)};trace.Tries=append(trace.Tries,router.Try{Channel:ch.ID,Status:res.StatusCode,Reason:reason,Millis:time.Since(started).Milliseconds()});remaining=removeChannel(remaining,ch.ID);continue}
		defer res.Body.Close();trace.Selected=ch.ID;s.Router.Clear(ch.ID)
		w.Header().Set("Content-Type","text/event-stream; charset=utf-8");w.Header().Set("Cache-Control","no-cache");w.Header().Set("X-Accel-Buffering","no");w.WriteHeader(http.StatusOK)
		flusher,_:=w.(http.Flusher)
		var stats protocol.StreamStats
		var streamErr error
		if nativeBridge{
			enc:=&protocol.OpenAIStreamEncoder{ID:"chatcmpl_"+auth.RandomID(""),Model:routed}
			stats,streamErr=readProtocolStream(ch.Protocol,res.Body,func(ev protocol.Event)error{raw:=enc.Encode(ev);if raw==nil{return nil};if s.Cfg.Redact{raw=s.Redact.RestoreBytes(raw)};_,err:=w.Write(raw);if flusher!=nil{flusher.Flush()};return err})
		}else{
			stats,streamErr=protocol.ReadOpenAISSE(res.Body,func(raw []byte,ev protocol.Event)error{if s.Cfg.Redact{raw=s.Redact.RestoreBytes(raw)};_,err:=w.Write(raw);if flusher!=nil{flusher.Flush()};return err})
		}
		lat:=time.Since(started);ttft:=time.Duration(0);if !stats.FirstEventAt.IsZero(){ttft=stats.FirstEventAt.Sub(started)}
		trace.Tries=append(trace.Tries,router.Try{Channel:ch.ID,Status:res.StatusCode,Millis:lat.Milliseconds()});s.Router.AddTrace(trace)
		s.recordUsageDetailed(r,k,ch,requested,routed,stats.ServedModel,path,res.StatusCode,stats.Usage,lat,ttft,affinity)
		return streamErr
	}
	s.Router.AddTrace(trace);return fmt.Errorf("all channels failed")
}
func removeChannel(in []provider.Channel,id string)[]provider.Channel{out:=in[:0];for _,c:=range in{if c.ID!=id{out=append(out,c)}};return out}
func usageFromBody(body []byte)(protocol.Usage,string){
	var v struct{Model string `json:"model"`;Usage struct{Prompt int64 `json:"prompt_tokens"`;Completion int64 `json:"completion_tokens"`;Input int64 `json:"input_tokens"`;Output int64 `json:"output_tokens"`;CacheRead int64 `json:"cache_read_input_tokens"`;CacheWrite int64 `json:"cache_creation_input_tokens"`;Reasoning int64 `json:"reasoning_tokens"`} `json:"usage"`}
	_=json.Unmarshal(body,&v);u:=protocol.Usage{Input:v.Usage.Prompt,Output:v.Usage.Completion,CacheRead:v.Usage.CacheRead,CacheWrite:v.Usage.CacheWrite,Reasoning:v.Usage.Reasoning,ServedModel:v.Model};if u.Input==0{u.Input=v.Usage.Input};if u.Output==0{u.Output=v.Usage.Output};return u,v.Model
}
func(s *Server)recordUsageDetailed(r *http.Request,k APIKey,ch provider.Channel,requested,routed,served,endpoint string,status int,u protocol.Usage,latency,ttft time.Duration,affinity string){
	cost:=(u.Input*ch.InputMicrosPerMillion+u.Output*ch.OutputMicrosPerMillion)/1_000_000;now:=time.Now().UTC().Format(time.RFC3339Nano)
	_,_=s.Store.DB.ExecContext(r.Context(),`INSERT INTO usage_records(id,workspace_id,api_key_id,channel_id,model,endpoint,input_tokens,output_tokens,cost_micros,latency_ms,status,created_at,requested_model,routed_model,served_model,cache_read_tokens,cache_write_tokens,reasoning_tokens,ttft_ms,affinity_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,auth.RandomID("use_"),k.WorkspaceID,k.ID,ch.ID,routed,endpoint,u.Input,u.Output,cost,latency.Milliseconds(),status,now,requested,routed,served,u.CacheRead,u.CacheWrite,u.Reasoning,ttft.Milliseconds(),affinity)
	if cost!=0{_,_=s.Store.DB.ExecContext(r.Context(),`UPDATE wallets SET balance_micros=balance_micros-?,updated_at=? WHERE workspace_id=?`,cost,now,k.WorkspaceID)}
}
func(s *Server)routeTraces(w http.ResponseWriter,r *http.Request){wid:=r.PathValue("wid");if _,_,err:=s.requireWorkspaceRole(r,wid);err!=nil{apiError(w,403,"forbidden","Workspace access required.");return};all:=s.Router.Traces();data:=make([]router.Trace,0,len(all));for _,t:=range all{if t.Workspace==wid{data=append(data,t)}};writeJSON(w,200,map[string]any{"data":data})}
func(s *Server)apiBalance(w http.ResponseWriter,r *http.Request){k,err:=s.authenticateAPI(r,"billing.read");if err!=nil{apiError(w,401,"unauthorized",err.Error());return};s.writeBalance(w,r,k.WorkspaceID)}
func(s *Server)apiUsage(w http.ResponseWriter,r *http.Request){k,err:=s.authenticateAPI(r,"billing.read");if err!=nil{apiError(w,401,"unauthorized",err.Error());return};s.writeUsage(w,r,k.WorkspaceID)}

func(s *Server)uploadFile(w http.ResponseWriter,r *http.Request){k,err:=s.authenticateAPI(r,"files.write");if err!=nil{apiError(w,401,"unauthorized",err.Error());return};r.Body=http.MaxBytesReader(w,r.Body,27<<20);if err:=r.ParseMultipartForm(25<<20);err!=nil{apiError(w,413,"file_too_large","File exceeds 25 MiB.");return};f,h,err:=r.FormFile("file");if err!=nil{apiError(w,400,"file_required","multipart field file is required.");return};defer f.Close();id:=auth.RandomID("file_");if err:=os.MkdirAll(s.Cfg.FilesDir,0o755);err!=nil{apiError(w,500,"storage_error",err.Error());return};path:=filepath.Join(s.Cfg.FilesDir,id);dst,err:=os.OpenFile(path,os.O_CREATE|os.O_WRONLY|os.O_TRUNC,0o600);if err!=nil{apiError(w,500,"storage_error",err.Error());return};n,err:=io.Copy(dst,io.LimitReader(f,25<<20));dst.Close();if err!=nil{apiError(w,500,"storage_error",err.Error());return};ct:=h.Header.Get("Content-Type");if ct==""{ct="application/octet-stream"};now:=time.Now().UTC().Format(time.RFC3339Nano);_,err=s.Store.DB.ExecContext(r.Context(),`INSERT INTO files(id,workspace_id,filename,content_type,bytes,path,purpose,created_at) VALUES(?,?,?,?,?,?,?,?)`,id,k.WorkspaceID,h.Filename,ct,n,path,"assistants",now);if err!=nil{apiError(w,500,"database_error",err.Error());return};writeJSON(w,201,map[string]any{"id":id,"object":"file","bytes":n,"filename":h.Filename})}
func(s *Server)listFiles(w http.ResponseWriter,r *http.Request){k,err:=s.authenticateAPI(r,"files.write");if err!=nil{apiError(w,401,"unauthorized",err.Error());return};rows,err:=s.Store.DB.QueryContext(r.Context(),`SELECT id,filename,content_type,bytes,created_at FROM files WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100`,k.WorkspaceID);if err!=nil{apiError(w,500,"database_error",err.Error());return};defer rows.Close();var data []map[string]any;for rows.Next(){var id,name,ct,created string;var n int64;if rows.Scan(&id,&name,&ct,&n,&created)==nil{data=append(data,map[string]any{"id":id,"filename":name,"content_type":ct,"bytes":n,"created_at":created})}};writeJSON(w,200,map[string]any{"object":"list","data":data})}
func(s *Server)getFile(w http.ResponseWriter,r *http.Request){s.fileMeta(w,r,false)}
func(s *Server)fileContent(w http.ResponseWriter,r *http.Request){s.fileMeta(w,r,true)}
func(s *Server)fileMeta(w http.ResponseWriter,r *http.Request,content bool){k,err:=s.authenticateAPI(r,"files.write");if err!=nil{apiError(w,401,"unauthorized",err.Error());return};var id,name,ct,path,created string;var n int64;err=s.Store.DB.QueryRowContext(r.Context(),`SELECT id,filename,content_type,bytes,path,created_at FROM files WHERE id=? AND workspace_id=?`,r.PathValue("id"),k.WorkspaceID).Scan(&id,&name,&ct,&n,&path,&created);if err!=nil{apiError(w,404,"file_not_found","File not found.");return};if content{w.Header().Set("Content-Type",ct);http.ServeFile(w,r,path);return};writeJSON(w,200,map[string]any{"id":id,"filename":name,"content_type":ct,"bytes":n,"created_at":created})}
func(s *Server)deleteFile(w http.ResponseWriter,r *http.Request){k,err:=s.authenticateAPI(r,"files.write");if err!=nil{apiError(w,401,"unauthorized",err.Error());return};var path string;if s.Store.DB.QueryRowContext(r.Context(),`SELECT path FROM files WHERE id=? AND workspace_id=?`,r.PathValue("id"),k.WorkspaceID).Scan(&path)!=nil{apiError(w,404,"file_not_found","File not found.");return};_,_=s.Store.DB.ExecContext(r.Context(),`DELETE FROM files WHERE id=?`,r.PathValue("id"));_=os.Remove(path);writeJSON(w,200,map[string]any{"deleted":true})}

func(s *Server)videos(w http.ResponseWriter,r *http.Request){
	k,err:=s.authenticateAPI(r,"video.generate");if err!=nil{apiError(w,401,"unauthorized",err.Error());return}
	raw,_:=io.ReadAll(io.LimitReader(r.Body,8<<20));var probe struct{Model string `json:"model"`};if json.Unmarshal(raw,&probe)!=nil||probe.Model==""{apiError(w,400,"invalid_request","model required.");return}
	rb,meta,err:=s.relayBufferedDetailed(r,k,probe.Model,probe.Model,"/v1/videos",raw,"");if err!=nil{apiError(w,502,"upstream_error",err.Error());return}
	var up map[string]any;_=json.Unmarshal(rb,&up);upID,_:=up["id"].(string);if upID==""{upID,_=up["task_id"].(string)}
	status:="running";if v,ok:=up["status"].(string);ok&&v!=""{status=v}
	id:=auth.RandomID("video_");now:=time.Now().UTC()
	_,_=s.Store.DB.ExecContext(r.Context(),`INSERT INTO video_tasks(id,workspace_id,api_key_id,channel_id,upstream_id,model,status,result_json,next_poll_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,id,k.WorkspaceID,k.ID,meta.Channel.ID,upID,probe.Model,status,string(rb),now.Add(2*time.Second).Format(time.RFC3339Nano),now.Format(time.RFC3339Nano),now.Format(time.RFC3339Nano))
	writeJSON(w,202,map[string]any{"id":id,"object":"video.task","status":status,"model":probe.Model})
}
func(s *Server)task(w http.ResponseWriter,r *http.Request){
	k,err:=s.authenticateAPI(r,"video.generate");if err!=nil{apiError(w,401,"unauthorized",err.Error());return}
	var id,model,status,result,updated string;err=s.Store.DB.QueryRowContext(r.Context(),`SELECT id,model,status,COALESCE(result_json,''),updated_at FROM video_tasks WHERE id=? AND workspace_id=?`,r.PathValue("id"),k.WorkspaceID).Scan(&id,&model,&status,&result,&updated);if err!=nil{apiError(w,404,"task_not_found","Task not found.");return}
	var obj any;_=json.Unmarshal([]byte(result),&obj);writeJSON(w,200,map[string]any{"id":id,"object":"video.task","model":model,"status":status,"result":obj,"updated_at":updated})
}
