package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/protocol"
	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/router"
)

func (s *Server)handleAnthropic(w http.ResponseWriter,r *http.Request,raw []byte,k APIKey,model string,stream bool){
	if stream{s.protocolStream(w,r,k,"anthropic",model,raw);return}
	out,err:=s.protocolBuffered(r,k,"anthropic",model,raw);if err!=nil{apiError(w,502,"upstream_error",err.Error());return}
	w.Header().Set("Content-Type","application/json");w.Write(out)
}

func (s *Server)gemini(w http.ResponseWriter,r *http.Request){s.handleGemini(w,r,false)}
func (s *Server)geminiStream(w http.ResponseWriter,r *http.Request){s.handleGemini(w,r,true)}
func (s *Server)handleGemini(w http.ResponseWriter,r *http.Request,stream bool){
	k,err:=s.authenticateAPI(r,"llm.chat");if err!=nil{apiError(w,401,"unauthorized",err.Error());return}
	raw,_:=io.ReadAll(io.LimitReader(r.Body,16<<20));model:=r.PathValue("model");if model==""{apiError(w,400,"invalid_request","model required.");return}
	if stream{s.protocolStream(w,r,k,"gemini",model,raw);return}
	out,err:=s.protocolBuffered(r,k,"gemini",model,raw);if err!=nil{apiError(w,502,"upstream_error",err.Error());return}
	w.Header().Set("Content-Type","application/json");w.Write(out)
}

func (s *Server)protocolBuffered(r *http.Request,k APIKey,clientProto,model string,raw []byte)([]byte,error){
	channels,err:=provider.Accessible(r.Context(),s.Store,k.WorkspaceID,model);if err!=nil||len(channels)==0{return nil,fmt.Errorf("no channel serves model %q",model)}
	remaining:=append([]provider.Channel(nil),channels...)
	for len(remaining)>0{
		ch,err:=s.Router.ChooseFor(remaining,"");if err!=nil{break}
		reqBody,path,err:=adaptRequest(clientProto,ch.Protocol,model,raw,false);if err!=nil{remaining=removeChannel(remaining,ch.ID);continue}
		req,err:=s.newProtocolRequest(r.Context(),ch,model,path,reqBody,false);if err!=nil{remaining=removeChannel(remaining,ch.ID);continue}
		started:=time.Now();res,err:=s.HTTP.Do(req);if err!=nil{s.Router.Rest(ch.ID,"network",0,time.Minute);remaining=removeChannel(remaining,ch.ID);continue}
		body,_:=io.ReadAll(io.LimitReader(res.Body,64<<20));res.Body.Close()
		if res.StatusCode<200||res.StatusCode>=400{reason,d:=router.ClassifyFailure(res.StatusCode,res.Header,body);if d>0{s.Router.Rest(ch.ID,reason,res.StatusCode,d)};remaining=removeChannel(remaining,ch.ID);continue}
		s.Router.Clear(ch.ID)
		openai,err:=responseToOpenAI(ch.Protocol,body);if err!=nil{return nil,err}
		usage,served:=usageFromBody(openai);s.recordUsageDetailed(r,k,ch,model,model,served,"/"+clientProto,res.StatusCode,usage,time.Since(started),0,"")
		switch clientProto{
		case"anthropic":return protocol.OpenAIToAnthropic(openai)
		case"gemini":return protocol.OpenAIToGemini(openai)
		}
		return openai,nil
	}
	return nil,fmt.Errorf("all channels failed")
}

func (s *Server)protocolStream(w http.ResponseWriter,r *http.Request,k APIKey,clientProto,model string,raw []byte){
	channels,err:=provider.Accessible(r.Context(),s.Store,k.WorkspaceID,model);if err!=nil||len(channels)==0{apiError(w,502,"upstream_error",fmt.Sprintf("no channel serves model %q",model));return}
	remaining:=append([]provider.Channel(nil),channels...)
	for len(remaining)>0{
		ch,err:=s.Router.ChooseFor(remaining,"");if err!=nil{break}
		reqBody,path,err:=adaptRequest(clientProto,ch.Protocol,model,raw,true);if err!=nil{remaining=removeChannel(remaining,ch.ID);continue}
		req,err:=s.newProtocolRequest(r.Context(),ch,model,path,reqBody,true);if err!=nil{remaining=removeChannel(remaining,ch.ID);continue}
		started:=time.Now();res,err:=s.HTTP.Do(req);if err!=nil{s.Router.Rest(ch.ID,"network",0,time.Minute);remaining=removeChannel(remaining,ch.ID);continue}
		if res.StatusCode<200||res.StatusCode>=400{body,_:=io.ReadAll(io.LimitReader(res.Body,8<<20));res.Body.Close();reason,d:=router.ClassifyFailure(res.StatusCode,res.Header,body);if d>0{s.Router.Rest(ch.ID,reason,res.StatusCode,d)};remaining=removeChannel(remaining,ch.ID);continue}
		s.Router.Clear(ch.ID);defer res.Body.Close();w.Header().Set("Content-Type","text/event-stream; charset=utf-8");w.Header().Set("Cache-Control","no-cache");w.Header().Set("X-Accel-Buffering","no");w.WriteHeader(200);flusher,_:=w.(http.Flusher)
		anthropicEncoder:=&protocol.AnthropicStreamEncoder{ID:"msg_"+auth.RandomID(""),Model:model}
		geminiEncoder:=&protocol.GeminiStreamEncoder{Model:model}
		emit:=func(ev protocol.Event)error{
			var chunks [][]byte
			switch clientProto{
			case"anthropic":chunks=anthropicEncoder.Encode(ev)
			case"gemini":b:=geminiEncoder.Encode(ev);if b!=nil{chunks=[][]byte{b}}
			}
			for _,b:=range chunks{if s.Cfg.Redact{b=s.Redact.RestoreBytes(b)};if _,err:=w.Write(b);err!=nil{return err};if flusher!=nil{flusher.Flush()}}
			return nil
		}
		stats,err:=readProtocolStream(ch.Protocol,res.Body,emit)
		lat:=time.Since(started);ttft:=time.Duration(0);if !stats.FirstEventAt.IsZero(){ttft=stats.FirstEventAt.Sub(started)}
		s.recordUsageDetailed(r,k,ch,model,model,stats.ServedModel,"/"+clientProto,res.StatusCode,stats.Usage,lat,ttft,"")
		if err!=nil{s.Log.Warn("protocol_stream_failed","protocol",ch.Protocol,"error",err)}
		return
	}
	apiError(w,502,"upstream_error","all channels failed")
}

func readProtocolStream(protoName string,r io.Reader,fn func(protocol.Event)error)(protocol.StreamStats,error){
	switch protoName{
	case"anthropic":return protocol.ReadAnthropicSSE(r,fn)
	case"gemini":return protocol.ReadGeminiSSE(r,fn)
	default:return protocol.ReadOpenAISSE(r,func(_ []byte,ev protocol.Event)error{return fn(ev)})
	}
}
func adaptRequest(clientProto,upstreamProto,model string,raw []byte,stream bool)([]byte,string,error){
	if clientProto=="anthropic"{
		if upstreamProto=="anthropic"{return raw,"/v1/messages",nil}
		openai,err:=protocol.AnthropicToOpenAI(raw);if err!=nil{return nil,"",err};openai=setStream(openai,stream)
		if upstreamProto=="gemini"{b,_,err:=protocol.OpenAIRequestToGemini(openai);return b,geminiPath(model,stream),err}
		return openai,"/v1/chat/completions",nil
	}
	if clientProto=="gemini"{
		if upstreamProto=="gemini"{return raw,geminiPath(model,stream),nil}
		openai,err:=protocol.GeminiToOpenAI(raw,model,stream);if err!=nil{return nil,"",err}
		if upstreamProto=="anthropic"{b,err:=protocol.OpenAIRequestToAnthropic(openai);return b,"/v1/messages",err}
		return openai,"/v1/chat/completions",nil
	}
	return raw,"/v1/chat/completions",nil
}
func setStream(body []byte,stream bool)[]byte{var v map[string]any;if json.Unmarshal(body,&v)==nil{v["stream"]=stream;if b,err:=json.Marshal(v);err==nil{return b}};return body}
func geminiPath(model string,stream bool)string{m:=url.PathEscape(model);if stream{return"/v1beta/models/"+m+":streamGenerateContent?alt=sse"};return"/v1beta/models/"+m+":generateContent"}
func (s *Server)newProtocolRequest(ctx context.Context,ch provider.Channel,model,path string,body []byte,stream bool)(*http.Request,error){
	base:=strings.TrimRight(ch.BaseURL,"/");if ch.Protocol=="anthropic"&&strings.HasSuffix(base,"/v1"){base=strings.TrimSuffix(base,"/v1")}
	if ch.Protocol=="gemini"&&strings.HasSuffix(base,"/v1beta"){base=strings.TrimSuffix(base,"/v1beta")}
	req,err:=http.NewRequestWithContext(ctx,http.MethodPost,base+path,bytes.NewReader(body));if err!=nil{return nil,err};req.Header.Set("Content-Type","application/json")
	switch ch.Protocol{
	case"anthropic":if ch.APIKey!=""{req.Header.Set("x-api-key",ch.APIKey)};req.Header.Set("anthropic-version","2023-06-01")
	case"gemini":if ch.APIKey!=""{req.Header.Set("x-goog-api-key",ch.APIKey)}
	default:if ch.APIKey!=""{req.Header.Set("Authorization","Bearer "+ch.APIKey)}
	}
	if stream{req.Header.Set("Accept","text/event-stream")};return req,nil
}
func responseToOpenAI(protoName string,body []byte)([]byte,error){
	switch protoName{
	case"anthropic":return protocol.AnthropicResponseToOpenAI(body)
	case"gemini":return protocol.GeminiResponseToOpenAI(body)
	default:return body,nil
	}
}
