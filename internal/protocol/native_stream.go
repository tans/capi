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
	type toolState struct{ID,Name string}
	tools:=map[int]toolState{}
	for sc.Scan(){
		line:=sc.Text();if !strings.HasPrefix(line,"data:"){continue};data:=strings.TrimSpace(strings.TrimPrefix(line,"data:"));if data==""{continue}
		var v struct{
			Type string `json:"type"`
			Index int `json:"index"`
			Message *struct{Model string `json:"model"`;Usage struct{Input int64 `json:"input_tokens"`;Output int64 `json:"output_tokens"`} `json:"usage"`} `json:"message"`
			ContentBlock *struct{Type string `json:"type"`;ID string `json:"id"`;Name string `json:"name"`} `json:"content_block"`
			Delta struct{Type string `json:"type"`;Text string `json:"text"`;PartialJSON string `json:"partial_json"`;StopReason string `json:"stop_reason"`} `json:"delta"`
			Usage *struct{Output int64 `json:"output_tokens"`} `json:"usage"`
		}
		if json.Unmarshal([]byte(data),&v)!=nil{continue};ev:=Event{At:time.Now()}
		switch v.Type{
		case"message_start":
			if v.Message!=nil{stats.ServedModel=v.Message.Model;stats.Usage.Input=v.Message.Usage.Input;stats.Usage.Output=v.Message.Usage.Output}
		case"content_block_start":
			if v.ContentBlock!=nil&&v.ContentBlock.Type=="tool_use"{tools[v.Index]=toolState{ID:v.ContentBlock.ID,Name:v.ContentBlock.Name};ev.Kind=EventTool;ev.Tools=[]ToolDelta{{Index:v.Index,ID:v.ContentBlock.ID,Name:v.ContentBlock.Name}}}
		case"content_block_delta":
			switch v.Delta.Type{
			case"text_delta":ev.Kind=EventText;ev.Text=v.Delta.Text
			case"input_json_delta":t:=tools[v.Index];ev.Kind=EventTool;ev.Tools=[]ToolDelta{{Index:v.Index,ID:t.ID,Name:t.Name,Arguments:v.Delta.PartialJSON}}
			}
		case"message_delta":
			if v.Usage!=nil{stats.Usage.Output=v.Usage.Output};ev.Kind=EventUsage;ev.Usage=stats.Usage;ev.Usage.ServedModel=stats.ServedModel
		case"message_stop":ev.Kind=EventDone
		}
		if stats.FirstEventAt.IsZero()&&(ev.Kind==EventText||ev.Kind==EventTool){stats.FirstEventAt=ev.At}
		if ev.Kind!=""{if err:=fn(ev);err!=nil{return stats,err}}
	}
	return stats,sc.Err()
}

func ReadGeminiSSE(r io.Reader,fn func(Event)error)(StreamStats,error){
	sc:=bufio.NewScanner(r);sc.Buffer(make([]byte,0,64<<10),32<<20);var stats StreamStats
	for sc.Scan(){
		line:=sc.Text();if !strings.HasPrefix(line,"data:"){continue};data:=strings.TrimSpace(strings.TrimPrefix(line,"data:"));if data==""||data=="[DONE]"{continue}
		var v struct{
			ModelVersion string `json:"modelVersion"`
			Candidates []struct{Content struct{Parts []struct{Text string `json:"text"`;FunctionCall *struct{Name string `json:"name"`;Args json.RawMessage `json:"args"`} `json:"functionCall"`} `json:"parts"`} `json:"content"`;FinishReason string `json:"finishReason"`} `json:"candidates"`
			Usage struct{Prompt int64 `json:"promptTokenCount"`;Candidates int64 `json:"candidatesTokenCount"`} `json:"usageMetadata"`
		}
		if json.Unmarshal([]byte(data),&v)!=nil{continue};if v.ModelVersion!=""{stats.ServedModel=v.ModelVersion}
		for _,c:=range v.Candidates{for i,p:=range c.Content.Parts{
			if p.Text!=""{ev:=Event{Kind:EventText,Text:p.Text,At:time.Now()};if stats.FirstEventAt.IsZero(){stats.FirstEventAt=ev.At};if err:=fn(ev);err!=nil{return stats,err}}
			if p.FunctionCall!=nil{args:=string(p.FunctionCall.Args);if args==""{args="{}"};ev:=Event{Kind:EventTool,Tools:[]ToolDelta{{Index:i,Name:p.FunctionCall.Name,Arguments:args}},At:time.Now()};if stats.FirstEventAt.IsZero(){stats.FirstEventAt=ev.At};if err:=fn(ev);err!=nil{return stats,err}}
		}}
		if v.Usage.Prompt>0||v.Usage.Candidates>0{stats.Usage.Input=v.Usage.Prompt;stats.Usage.Output=v.Usage.Candidates;stats.Usage.ServedModel=stats.ServedModel;if err:=fn(Event{Kind:EventUsage,Usage:stats.Usage,At:time.Now()});err!=nil{return stats,err}}
	}
	if err:=fn(Event{Kind:EventDone,At:time.Now()});err!=nil{return stats,err};return stats,sc.Err()
}

type OpenAIStreamEncoder struct{ID,Model string}
func(e *OpenAIStreamEncoder)Encode(ev Event)[]byte{
	switch ev.Kind{
	case EventText:
		b,_:=json.Marshal(map[string]any{"id":e.ID,"object":"chat.completion.chunk","model":e.Model,"choices":[]any{map[string]any{"index":0,"delta":map[string]any{"content":ev.Text},"finish_reason":nil}}});return []byte("data: "+string(b)+"\n\n")
	case EventTool:
		var calls []map[string]any
		for _,t:=range ev.Tools{calls=append(calls,map[string]any{"index":t.Index,"id":t.ID,"type":"function","function":map[string]any{"name":t.Name,"arguments":t.Arguments}})}
		b,_:=json.Marshal(map[string]any{"id":e.ID,"object":"chat.completion.chunk","model":e.Model,"choices":[]any{map[string]any{"index":0,"delta":map[string]any{"tool_calls":calls},"finish_reason":nil}}});return []byte("data: "+string(b)+"\n\n")
	case EventUsage:
		b,_:=json.Marshal(map[string]any{"id":e.ID,"object":"chat.completion.chunk","model":e.Model,"choices":[]any{},"usage":map[string]any{"prompt_tokens":ev.Usage.Input,"completion_tokens":ev.Usage.Output}});return []byte("data: "+string(b)+"\n\n")
	case EventDone:return []byte("data: [DONE]\n\n")
	}
	return nil
}
