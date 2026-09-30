package provider

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	CodexBase = "https://chatgpt.com/backend-api/codex"
	codexTokenURL = "https://auth.openai.com/oauth/token"
	codexClientID = "app_EMoamEEZ73f0CkXaXp7hrann"
)

type CodexAuth struct {
	AuthMode string `json:"auth_mode"`
	Tokens struct {
		IDToken string `json:"id_token"`
		AccessToken string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		AccountID string `json:"account_id"`
	} `json:"tokens"`
}

type QuotaWindow struct {
	Name string `json:"name"`
	UsedPercent float64 `json:"used_percent"`
	ResetAt int64 `json:"reset_at,omitempty"`
	ResetAfterSeconds int64 `json:"reset_after_seconds,omitempty"`
	WindowSeconds int64 `json:"window_seconds,omitempty"`
}
type ChatGPTQuota struct {
	Plan string `json:"plan"`
	Windows []QuotaWindow `json:"windows"`
	ResetCredits int `json:"reset_credits,omitempty"`
}

func ParseCodexAuth(raw []byte)(CodexAuth,error){
	var a CodexAuth
	if err:=json.Unmarshal(raw,&a);err!=nil{return a,err}
	if a.AuthMode=="apikey"||a.Tokens.AccessToken==""{return a,errors.New("Codex auth.json is not signed in with ChatGPT")}
	if a.Tokens.AccountID==""{a.Tokens.AccountID=jwtString(a.Tokens.IDToken,"https://api.openai.com/auth","chatgpt_account_id")}
	return a,nil
}
func CodexIdentity(raw []byte)(email,plan,accountID string){
	a,err:=ParseCodexAuth(raw);if err!=nil{return "","",""}
	email=jwtString(a.Tokens.IDToken,"email")
	plan=jwtString(a.Tokens.IDToken,"https://api.openai.com/auth","chatgpt_plan_type")
	return email,plan,a.Tokens.AccountID
}
func CodexAccess(ctx context.Context,raw []byte)(token,accountID string,updated []byte,err error){
	a,err:=ParseCodexAuth(raw);if err!=nil{return "","",nil,err}
	accountID=a.Tokens.AccountID
	exp:=jwtNumber(a.Tokens.AccessToken,"exp")
	if exp>0&&time.Until(time.Unix(int64(exp),0))>5*time.Minute{return a.Tokens.AccessToken,accountID,raw,nil}
	if a.Tokens.RefreshToken==""{return "","",nil,errors.New("ChatGPT refresh token missing; run codex login again")}
	body,_:=json.Marshal(map[string]string{"client_id":codexClientID,"grant_type":"refresh_token","refresh_token":a.Tokens.RefreshToken,"scope":"openid profile email"})
	req,err:=http.NewRequestWithContext(ctx,http.MethodPost,codexTokenURL,bytes.NewReader(body));if err!=nil{return "","",nil,err};req.Header.Set("Content-Type","application/json")
	res,err:=http.DefaultClient.Do(req);if err!=nil{return "","",nil,err};defer res.Body.Close();b,_:=io.ReadAll(io.LimitReader(res.Body,1<<20))
	var fresh struct{IDToken string `json:"id_token"`;AccessToken string `json:"access_token"`;RefreshToken string `json:"refresh_token"`}
	if res.StatusCode!=200||json.Unmarshal(b,&fresh)!=nil||fresh.AccessToken==""{return "","",nil,fmt.Errorf("ChatGPT token refresh failed: %s",res.Status)}
	a.Tokens.AccessToken=fresh.AccessToken;if fresh.IDToken!=""{a.Tokens.IDToken=fresh.IDToken};if fresh.RefreshToken!=""{a.Tokens.RefreshToken=fresh.RefreshToken}
	updated,_=json.Marshal(a);return a.Tokens.AccessToken,accountID,updated,nil
}

func CodexModels(ctx context.Context,raw []byte)([]string,[]byte,error){
	tok,account,updated,err:=CodexAccess(ctx,raw);if err!=nil{return nil,nil,err}
	v:=codexVersion()
	req,err:=http.NewRequestWithContext(ctx,http.MethodGet,CodexBase+"/models?client_version="+url.QueryEscape(v),nil);if err!=nil{return nil,nil,err};signCodex(req,tok,account,v)
	res,err:=http.DefaultClient.Do(req);if err!=nil{return nil,nil,err};defer res.Body.Close();b,_:=io.ReadAll(io.LimitReader(res.Body,4<<20))
	if res.StatusCode!=200{return nil,nil,fmt.Errorf("ChatGPT model list: %s",res.Status)}
	var payload struct{Models []struct{Slug string `json:"slug"`} `json:"models"`}
	if err:=json.Unmarshal(b,&payload);err!=nil{return nil,nil,err}
	var out []string;seen:=map[string]bool{}
	for _,m:=range payload.Models{if m.Slug!=""&&!seen[m.Slug]{seen[m.Slug]=true;out=append(out,"codex/"+m.Slug)}}
	if len(out)==0{return nil,nil,errors.New("ChatGPT listed no Codex models")}
	return out,updated,nil
}

func CodexQuota(ctx context.Context,raw []byte)(ChatGPTQuota,[]byte,error){
	var out ChatGPTQuota
	tok,account,updated,err:=CodexAccess(ctx,raw);if err!=nil{return out,nil,err}
	req,err:=http.NewRequestWithContext(ctx,http.MethodGet,"https://chatgpt.com/backend-api/wham/usage",nil);if err!=nil{return out,nil,err};signCodex(req,tok,account,codexVersion())
	res,err:=http.DefaultClient.Do(req);if err!=nil{return out,nil,err};defer res.Body.Close();b,_:=io.ReadAll(io.LimitReader(res.Body,2<<20))
	if res.StatusCode<200||res.StatusCode>=300{return out,nil,fmt.Errorf("ChatGPT usage: %s",res.Status)}
	var data struct{
		PlanType string `json:"plan_type"`
		RateLimit struct{Primary *struct{Used float64 `json:"used_percent"`;Window int64 `json:"limit_window_seconds"`;ResetAt int64 `json:"reset_at"`;ResetAfter int64 `json:"reset_after_seconds"`} `json:"primary_window"`;Secondary *struct{Used float64 `json:"used_percent"`;Window int64 `json:"limit_window_seconds"`;ResetAt int64 `json:"reset_at"`;ResetAfter int64 `json:"reset_after_seconds"`} `json:"secondary_window"`} `json:"rate_limit"`
		Resets *struct{Available int `json:"available_count"`} `json:"rate_limit_reset_credits"`
	}
	if err:=json.Unmarshal(b,&data);err!=nil{return out,nil,err};out.Plan=data.PlanType
	add:=func(name string,w *struct{Used float64 `json:"used_percent"`;Window int64 `json:"limit_window_seconds"`;ResetAt int64 `json:"reset_at"`;ResetAfter int64 `json:"reset_after_seconds"`}){if w!=nil{out.Windows=append(out.Windows,QuotaWindow{Name:name,UsedPercent:w.Used,ResetAt:w.ResetAt,ResetAfterSeconds:w.ResetAfter,WindowSeconds:w.Window})}}
	add("primary",data.RateLimit.Primary);add("secondary",data.RateLimit.Secondary);if data.Resets!=nil{out.ResetCredits=data.Resets.Available}
	return out,updated,nil
}

func SignCodexRequest(req *http.Request,raw []byte)([]byte,error){
	tok,account,updated,err:=CodexAccess(req.Context(),raw);if err!=nil{return nil,err};signCodex(req,tok,account,codexVersion());return updated,nil
}
func signCodex(req *http.Request,token,account,version string){
	req.Header.Set("Authorization","Bearer "+token);if account!=""{req.Header.Set("chatgpt-account-id",account)}
	req.Header.Set("OpenAI-Beta","responses=experimental");req.Header.Set("originator","codex_cli_rs");req.Header.Set("version",version);req.Header.Set("User-Agent","codex_cli_rs/"+version+" (CAPI; server)")
	req.Header.Set("Accept","text/event-stream")
}
func codexVersion()string{if v:=strings.TrimSpace(os.Getenv("CAPI_CODEX_VERSION"));v!=""{return v};return "0.159.2"}

func jwtPart(token string)map[string]any{parts:=strings.Split(token,".");if len(parts)<2{return nil};b,err:=base64.RawURLEncoding.DecodeString(parts[1]);if err!=nil{return nil};var m map[string]any;if json.Unmarshal(b,&m)!=nil{return nil};return m}
func jwtString(token string,path ...string)string{var v any=jwtPart(token);for _,k:=range path{m,ok:=v.(map[string]any);if !ok{return""};v=m[k]};s,_:=v.(string);return s}
func jwtNumber(token string,path ...string)float64{var v any=jwtPart(token);for _,k:=range path{m,ok:=v.(map[string]any);if !ok{return 0};v=m[k]};n,_:=v.(float64);return n}
