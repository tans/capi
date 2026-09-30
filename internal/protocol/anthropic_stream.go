package protocol

import (
	"encoding/json"
	"fmt"
)

type AnthropicStreamEncoder struct {
	Started bool
	Model string
	ID string
	OutputTokens int64
	InputTokens int64
	Index int
}

func (e *AnthropicStreamEncoder) Encode(ev Event) [][]byte {
	var out [][]byte
	emit:=func(name string,v any){b,_:=json.Marshal(v);out=append(out,[]byte("event: "+name+"\ndata: "+string(b)+"\n\n"))}
	if !e.Started {
		e.Started=true
		emit("message_start",map[string]any{"type":"message_start","message":map[string]any{"id":e.ID,"type":"message","role":"assistant","model":e.Model,"content":[]any{},"stop_reason":nil,"stop_sequence":nil,"usage":map[string]any{"input_tokens":0,"output_tokens":0}}})
		emit("content_block_start",map[string]any{"type":"content_block_start","index":0,"content_block":map[string]any{"type":"text","text":""}})
	}
	switch ev.Kind {
	case EventText:
		emit("content_block_delta",map[string]any{"type":"content_block_delta","index":0,"delta":map[string]any{"type":"text_delta","text":ev.Text}})
	case EventUsage:
		e.InputTokens=ev.Usage.Input;e.OutputTokens=ev.Usage.Output
	case EventDone:
		emit("content_block_stop",map[string]any{"type":"content_block_stop","index":0})
		emit("message_delta",map[string]any{"type":"message_delta","delta":map[string]any{"stop_reason":"end_turn","stop_sequence":nil},"usage":map[string]any{"output_tokens":e.OutputTokens}})
		emit("message_stop",map[string]any{"type":"message_stop"})
	}
	return out
}

func OpenAIRequestToAnthropic(body []byte)([]byte,error){
	var in struct{
		Model string `json:"model"`
		Messages []struct{Role string `json:"role"`;Content any `json:"content"`} `json:"messages"`
		MaxTokens int `json:"max_tokens"`
		Stream bool `json:"stream"`
		Tools any `json:"tools,omitempty"`
		System any `json:"system,omitempty"`
	}
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	var system any
	var messages []map[string]any
	for _,m:=range in.Messages{
		if m.Role=="system"{system=m.Content;continue}
		role:=m.Role;if role=="tool"{role="user"}
		messages=append(messages,map[string]any{"role":role,"content":m.Content})
	}
	out:=map[string]any{"model":in.Model,"messages":messages,"max_tokens":in.MaxTokens,"stream":in.Stream}
	if out["max_tokens"].(int)==0{out["max_tokens"]=1024}
	if system!=nil{out["system"]=system};if in.Tools!=nil{out["tools"]=in.Tools}
	return json.Marshal(out)
}

func AnthropicResponseToOpenAI(body []byte)([]byte,error){
	var in struct{ID string `json:"id"`;Model string `json:"model"`;Content []struct{Type string `json:"type"`;Text string `json:"text"`} `json:"content"`;StopReason string `json:"stop_reason"`;Usage struct{Input int64 `json:"input_tokens"`;Output int64 `json:"output_tokens"`} `json:"usage"`}
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	text:="";for _,p:=range in.Content{if p.Type=="text"{text+=p.Text}}
	if in.ID==""{return nil,fmt.Errorf("anthropic response missing id")}
	return json.Marshal(map[string]any{"id":in.ID,"object":"chat.completion","model":in.Model,"choices":[]any{map[string]any{"index":0,"message":map[string]any{"role":"assistant","content":text},"finish_reason":"stop"}},"usage":map[string]any{"prompt_tokens":in.Usage.Input,"completion_tokens":in.Usage.Output}})
}
