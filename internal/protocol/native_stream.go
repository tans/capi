package protocol

import (
	"bufio"
	"encoding/json"
	"io"
	"strings"
	"time"
)

func ReadAnthropicSSE(r io.Reader,fn func(Event)error)(StreamStats,error){
	sc:=bufio.NewScanner(r);sc.Buffer(make([]byte,0,64<<10),32<<20);var stats StreamStats
	for sc.Scan(){
		line:=sc.Text();if !strings.HasPrefix(line,"data:"){continue};data:=strings.TrimSpace(strings.TrimPrefix(line,"data:"));if data==""{continue}
		var v struct{Type string `json:"type"`;Message *struct{Model string `json:"model"`;Usage struct{Input int64 `json:"input_tokens"`;Output int64 `json:"output_tokens"`} `json:"usage"`} `json:"message"`;Delta struct{Type string `json:"type"`;Text string `json:"text"`;StopReason string `json:"stop_reason"`} `json:"delta"`;Usage *struct{Output int64 `json:"output_tokens"`} `json:"usage"`}
		if json.Unmarshal([]byte(data),&v)!=nil{continue};ev:=Event{At:time.Now()}
		switch v.Type{
		case"message_start":if v.Message!=nil{stats.ServedModel=v.Message.Model;stats.Usage.Input=v.Message.Usage.Input;stats.Usage.Output=v.Message.Usage.Output}
		case"content_block_delta":if v.Delta.Type=="text_delta"{ev.Kind=EventText;ev.Text=v.Delta.Text}
		case"message_delta":if v.Usage!=nil{stats.Usage.Output=v.Usage.Output};ev.Kind=EventUsage;ev.Usage=stats.Usage;ev.Usage.ServedModel=stats.ServedModel
		case"message_stop":ev.Kind=EventDone
		}
		if stats.FirstEventAt.IsZero()&&ev.Kind==EventText{stats.FirstEventAt=ev.At}
		if ev.Kind!=""{if err:=fn(ev);err!=nil{return stats,err}}
	}
	return stats,sc.Err()
}

func ReadGeminiSSE(r io.Reader,fn func(Event)error)(StreamStats,error){
	sc:=bufio.NewScanner(r);sc.Buffer(make([]byte,0,64<<10),32<<20);var stats StreamStats
	for sc.Scan(){
		line:=sc.Text();if !strings.HasPrefix(line,"data:"){continue};data:=strings.TrimSpace(strings.TrimPrefix(line,"data:"));if data==""||data=="[DONE]"{continue}
		var v struct{ModelVersion string `json:"modelVersion"`;Candidates []struct{Content struct{Parts []struct{Text string `json:"text"`} `json:"parts"`} `json:"content"`;FinishReason string `json:"finishReason"`} `json:"candidates"`;Usage struct{Prompt int64 `json:"promptTokenCount"`;Candidates int64 `json:"candidatesTokenCount"`} `json:"usageMetadata"`}
		if json.Unmarshal([]byte(data),&v)!=nil{continue};if v.ModelVersion!=""{stats.ServedModel=v.ModelVersion}
		for _,c:=range v.Candidates{for _,p:=range c.Content.Parts{if p.Text!=""{ev:=Event{Kind:EventText,Text:p.Text,At:time.Now()};if stats.FirstEventAt.IsZero(){stats.FirstEventAt=ev.At};if err:=fn(ev);err!=nil{return stats,err}}}}
		if v.Usage.Prompt>0||v.Usage.Candidates>0{stats.Usage.Input=v.Usage.Prompt;stats.Usage.Output=v.Usage.Candidates;stats.Usage.ServedModel=stats.ServedModel;if err:=fn(Event{Kind:EventUsage,Usage:stats.Usage,At:time.Now()});err!=nil{return stats,err}}
	}
	if err:=fn(Event{Kind:EventDone,At:time.Now()});err!=nil{return stats,err};return stats,sc.Err()
}

type OpenAIStreamEncoder struct{ID,Model string;Started bool}
func(e *OpenAIStreamEncoder)Encode(ev Event)[]byte{
	switch ev.Kind{
	case EventText:
		b,_:=json.Marshal(map[string]any{"id":e.ID,"object":"chat.completion.chunk","model":e.Model,"choices":[]any{map[string]any{"index":0,"delta":map[string]any{"content":ev.Text},"finish_reason":nil}}});return []byte("data: "+string(b)+"\n\n")
	case EventUsage:
		b,_:=json.Marshal(map[string]any{"id":e.ID,"object":"chat.completion.chunk","model":e.Model,"choices":[]any{},"usage":map[string]any{"prompt_tokens":ev.Usage.Input,"completion_tokens":ev.Usage.Output}});return []byte("data: "+string(b)+"\n\n")
	case EventDone:return []byte("data: [DONE]\n\n")
	}
	return nil
}
