package server

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/store"
	"github.com/tans/capi/internal/worker"
)

func TestCustomerClosure(t *testing.T) {
	upstream:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
		switch {
		case r.Method=="GET"&&r.URL.Path=="/v1/models":
			writeJSON(w,200,map[string]any{"object":"list","data":[]map[string]any{{"id":"chat-model"},{"id":"video-model"}}})
		case r.Method=="GET"&&r.URL.Path=="/codex/models":
			writeJSON(w,200,map[string]any{"models":[]map[string]any{{"slug":"gpt-codex"}}})
		case r.Method=="GET"&&r.URL.Path=="/wham/usage":
			writeJSON(w,200,map[string]any{"plan_type":"plus","rate_limit":map[string]any{"primary_window":map[string]any{"used_percent":12.5,"limit_window_seconds":18000,"reset_at":time.Now().Add(time.Hour).Unix(),"reset_after_seconds":3600},"secondary_window":map[string]any{"used_percent":30.0,"limit_window_seconds":604800,"reset_at":time.Now().Add(24*time.Hour).Unix(),"reset_after_seconds":86400}},"rate_limit_reset_credits":map[string]any{"available_count":2}})
		case r.Method=="POST"&&r.URL.Path=="/codex/responses":
			w.Header().Set("Content-Type","text/event-stream")
			io.WriteString(w,"event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"codex-ok\"}\n\n")
			io.WriteString(w,"event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"model\":\"gpt-codex\",\"usage\":{\"input_tokens\":5,\"output_tokens\":2}}}\n\n")
		case r.Method=="POST"&&r.URL.Path=="/v1/chat/completions":
			var in map[string]any;_ = json.NewDecoder(r.Body).Decode(&in)
			if in["stream"]==true{
				w.Header().Set("Content-Type","text/event-stream")
				io.WriteString(w,"data: {\"id\":\"c1\",\"model\":\"served-chat-model\",\"choices\":[{\"delta\":{\"content\":\"smoke-ok\"}}]}\n\n")
				if f,ok:=w.(http.Flusher);ok{f.Flush()}
				io.WriteString(w,"data: {\"id\":\"c1\",\"model\":\"served-chat-model\",\"choices\":[],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":3}}\n\n")
				io.WriteString(w,"data: [DONE]\n\n")
				return
			}
			writeJSON(w,200,map[string]any{"id":"c1","model":"served-chat-model","choices":[]any{},"usage":map[string]any{"prompt_tokens":10,"completion_tokens":3}})
		case r.Method=="POST"&&r.URL.Path=="/v1/videos":
			writeJSON(w,200,map[string]any{"id":"up-video-1","status":"running"})
		case r.Method=="GET"&&r.URL.Path=="/v1/tasks/up-video-1":
			writeJSON(w,200,map[string]any{"id":"up-video-1","status":"succeeded","result":map[string]any{"url":"https://example.test/video.mp4"}})
		default:
			http.NotFound(w,r)
		}
	}))
	defer upstream.Close()
	oldCodexBase:=provider.CodexBase
	provider.CodexBase=upstream.URL+"/codex"
	defer func(){provider.CodexBase=oldCodexBase}()

	dir:=t.TempDir()
	cfg:=config.Load()
	cfg.DataDir=dir
	cfg.DBPath=dir+"/capi.sqlite"
	cfg.FilesDir=dir+"/files"
	cfg.PublicBaseURL="http://capi.test"
	cfg.TrustedOrigins=[]string{"http://capi.test"}
	cfg.RelayTimeout=5*time.Second
	st,err:=store.Open(cfg.DBPath);if err!=nil{t.Fatal(err)}
	defer st.Close()
	log:=slog.New(slog.NewTextHandler(io.Discard,nil))
	app:=New(cfg,st,log)
	ts:=httptest.NewServer(app.Handler())
	defer ts.Close()

	ctx,cancel:=context.WithCancel(context.Background());defer cancel()
	go worker.New(cfg,st,log).Run(ctx)

	client:=&http.Client{}
	var sessionCookie *http.Cookie
	doJSON:=func(method,path string,body any,session bool)(*http.Response,[]byte){
		var rd io.Reader
		if body!=nil{b,_:=json.Marshal(body);rd=bytes.NewReader(b)}
		req,_:=http.NewRequest(method,ts.URL+path,rd);if body!=nil{req.Header.Set("Content-Type","application/json")}
		if session&&sessionCookie!=nil{req.AddCookie(sessionCookie)}
		res,err:=client.Do(req);if err!=nil{t.Fatal(err)}
		b,_:=io.ReadAll(res.Body);res.Body.Close()
		return res,b
	}

	res,b:=doJSON("POST","/api/auth/register",map[string]any{"name":"Smoke","email":"smoke@example.com","password":"smoke-password-123"},false)
	if res.StatusCode!=201{t.Fatalf("register %d %s",res.StatusCode,b)}
	for _,c:=range res.Cookies(){if c.Name=="capi_session"{sessionCookie=c}}
	if sessionCookie==nil{t.Fatal("missing session cookie")}
	var registered struct{WorkspaceID string `json:"workspace_id"`};_ = json.Unmarshal(b,&registered)
	if registered.WorkspaceID==""{t.Fatal("missing workspace id")}

	res,b=doJSON("POST","/api/workspaces/"+registered.WorkspaceID+"/channels",map[string]any{"name":"Mock","protocol":"openai","base_url":upstream.URL+"/v1","api_key":"upstream-key","priority":10,"weight":1},true)
	if res.StatusCode!=201{t.Fatalf("channel %d %s",res.StatusCode,b)}

	res,b=doJSON("POST","/api/workspaces/"+registered.WorkspaceID+"/keys",map[string]any{"name":"Smoke","scopes":[]string{"llm.chat","video.generate","billing.read"}},true)
	if res.StatusCode!=201{t.Fatalf("key %d %s",res.StatusCode,b)}
	var key struct{Secret string `json:"secret"`};_ = json.Unmarshal(b,&key)
	if key.Secret==""{t.Fatal("missing api key")}

	future:=time.Now().Add(time.Hour).Unix()
	idToken:=fakeJWT(map[string]any{"email":"smoke@example.com","https://api.openai.com/auth":map[string]any{"chatgpt_plan_type":"plus","chatgpt_account_id":"acct_smoke"}})
	accessToken:=fakeJWT(map[string]any{"exp":future})
	codexAuth:=map[string]any{"auth_mode":"chatgpt","tokens":map[string]any{"id_token":idToken,"access_token":accessToken,"refresh_token":"refresh-smoke","account_id":"acct_smoke"}}
	res,b=doJSON("POST","/api/workspaces/"+registered.WorkspaceID+"/chatgpt-subscription",map[string]any{"auth_json":codexAuth,"priority":20,"weight":1},true)
	if res.StatusCode!=201{t.Fatalf("chatgpt import %d %s",res.StatusCode,b)}
	var sub struct{ID string `json:"id"`;Models []string `json:"models"`};_ = json.Unmarshal(b,&sub)
	if sub.ID==""||len(sub.Models)==0||sub.Models[0]!="codex/gpt-codex"{t.Fatalf("chatgpt import response %s",b)}
	res,b=doJSON("GET","/api/workspaces/"+registered.WorkspaceID+"/chatgpt-subscription/"+sub.ID+"/quota",nil,true)
	if res.StatusCode!=200||!strings.Contains(string(b),"\"plan\":\"plus\"")||!strings.Contains(string(b),"\"reset_credits\":2"){t.Fatalf("chatgpt quota %d %s",res.StatusCode,b)}

	api:=func(method,path string,body any,headers map[string]string)(*http.Response,[]byte){
		var rd io.Reader;if body!=nil{j,_:=json.Marshal(body);rd=bytes.NewReader(j)}
		req,_:=http.NewRequest(method,ts.URL+path,rd);req.Header.Set("Authorization","Bearer "+key.Secret);if body!=nil{req.Header.Set("Content-Type","application/json")};for k,v:=range headers{req.Header.Set(k,v)}
		res,err:=client.Do(req);if err!=nil{t.Fatal(err)};bb,_:=io.ReadAll(res.Body);res.Body.Close();return res,bb
	}

	res,b=api("GET","/v1/models",nil,nil)
	if res.StatusCode!=200||!strings.Contains(string(b),"chat-model")||!strings.Contains(string(b),"codex/gpt-codex"){t.Fatalf("models %d %s",res.StatusCode,b)}

	res,b=api("POST","/v1/responses",map[string]any{"model":"codex/gpt-codex","stream":true,"input":"reply codex-ok"},nil)
	if res.StatusCode!=200||!strings.Contains(string(b),"codex-ok")||!strings.Contains(string(b),"response.completed"){t.Fatalf("chatgpt subscription responses %d %s",res.StatusCode,b)}

	res,b=api("POST","/v1/chat/completions",map[string]any{"model":"chat-model","stream":true,"messages":[]map[string]any{{"role":"user","content":"reply smoke-ok"}}},map[string]string{"X-CAPI-Session":"closure-1"})
	if res.StatusCode!=200||!strings.Contains(string(b),"smoke-ok")||!strings.Contains(res.Header.Get("Content-Type"),"text/event-stream"){t.Fatalf("chat stream %d %s %s",res.StatusCode,res.Header.Get("Content-Type"),b)}

	res,b=api("POST","/v1/messages",map[string]any{"model":"chat-model","stream":true,"max_tokens":32,"messages":[]map[string]any{{"role":"user","content":"reply smoke-ok"}}},nil)
	if res.StatusCode!=200||!strings.Contains(string(b),"event: message_start")||!strings.Contains(string(b),"smoke-ok"){t.Fatalf("anthropic stream %d %s",res.StatusCode,b)}

	gemReq,_:=http.NewRequest("POST",ts.URL+"/v1beta/models/chat-model:streamGenerateContent?alt=sse",strings.NewReader(`{"contents":[{"role":"user","parts":[{"text":"reply smoke-ok"}]}]}`))
	gemReq.Header.Set("Content-Type","application/json");gemReq.Header.Set("x-goog-api-key",key.Secret)
	gemRes,err:=client.Do(gemReq);if err!=nil{t.Fatal(err)};gemBody,_:=io.ReadAll(gemRes.Body);gemRes.Body.Close()
	if gemRes.StatusCode!=200||!strings.Contains(string(gemBody),"smoke-ok"){t.Fatalf("gemini stream %d %s",gemRes.StatusCode,gemBody)}

	res,b=api("GET","/v1/me/usage",nil,nil)
	if res.StatusCode!=200||!strings.Contains(string(b),"\"requested_model\":\"chat-model\"")||!strings.Contains(string(b),"\"served_model\":\"served-chat-model\""){t.Fatalf("usage %d %s",res.StatusCode,b)}

	res,b=api("GET","/v1/me/balance",nil,nil)
	if res.StatusCode!=200||!strings.Contains(string(b),"\"balance\""){t.Fatalf("balance %d %s",res.StatusCode,b)}

	res,b=api("POST","/v1/videos",map[string]any{"model":"video-model","prompt":"smoke video"},nil)
	if res.StatusCode!=202{t.Fatalf("video %d %s",res.StatusCode,b)}
	var task struct{ID string `json:"id"`};_ = json.Unmarshal(b,&task);if task.ID==""{t.Fatal("missing video task")}

	deadline:=time.Now().Add(6*time.Second)
	for {
		res,b=api("GET","/v1/tasks/"+task.ID,nil,nil)
		if res.StatusCode==200&&strings.Contains(string(b),"\"status\":\"succeeded\""){break}
		if time.Now().After(deadline){t.Fatalf("video task never succeeded: %s",b)}
		time.Sleep(250*time.Millisecond)
	}

	res,b=doJSON("GET","/api/workspaces/"+registered.WorkspaceID+"/routes",nil,true)
	if res.StatusCode!=200||!strings.Contains(string(b),"closure-1"){t.Fatalf("route trace %d %s",res.StatusCode,b)}

	if _,err:=os.Stat(cfg.DBPath);err!=nil{t.Fatalf("database not persisted: %v",err)}
}

func fakeJWT(claims map[string]any) string {
	header:=base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none"}`))
	payload,_:=json.Marshal(claims)
	return header+"."+base64.RawURLEncoding.EncodeToString(payload)+".x"
}
