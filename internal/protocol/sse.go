package protocol

import (
	"bufio"
	"encoding/json"
	"io"
	"strings"
	"time"
)

type EventKind string
const(
	EventText EventKind="text"
	EventTool EventKind="tool"
	EventUsage EventKind="usage"
	EventDone EventKind="done"
)

type Event struct{
	Kind EventKind
	Text string
	Usage Usage
	At time.Time
}

type Usage struct{
	Input int64 `json:"input"`
	Output int64 `json:"output"`
	CacheRead int64 `json:"cache_read"`
	CacheWrite int64 `json:"cache_write"`
	Reasoning int64 `json:"reasoning"`
	ServedModel string `json:"served_model,omitempty"`
}

type StreamStats struct{
	Usage Usage
	FirstEventAt time.Time
	ServedModel string
}

func ReadOpenAISSE(r io.Reader, fn func(raw []byte, ev Event) error)(StreamStats,error){
	sc:=bufio.NewScanner(r)
	sc.Buffer(make([]byte,0,64<<10),32<<20)
	var stats StreamStats
	for sc.Scan(){
		line:=sc.Text()
		if !strings.HasPrefix(line,"data:"){continue}
		data:=strings.TrimSpace(strings.TrimPrefix(line,"data:"))
		if data==""{continue}
		if data=="[DONE]"{if err:=fn([]byte("data: [DONE]\n\n"),Event{Kind:EventDone,At:time.Now()});err!=nil{return stats,err};continue}
		var payload struct{
			Model string `json:"model"`
			Choices []struct{Delta struct{Content string `json:"content"`;ToolCalls []any `json:"tool_calls"`} `json:"delta"`} `json:"choices"`
			Usage *struct{Prompt int64 `json:"prompt_tokens"`;Completion int64 `json:"completion_tokens"`;Input int64 `json:"input_tokens"`;Output int64 `json:"output_tokens"`;CacheRead int64 `json:"cache_read_input_tokens"`;Reasoning int64 `json:"reasoning_tokens"`} `json:"usage"`
		}
		ev:=Event{At:time.Now()}
		if json.Unmarshal([]byte(data),&payload)==nil{
			if payload.Model!=""{stats.ServedModel=payload.Model}
			if len(payload.Choices)>0&&payload.Choices[0].Delta.Content!=""{ev.Kind=EventText;ev.Text=payload.Choices[0].Delta.Content}
			if payload.Usage!=nil{
				ev.Kind=EventUsage
				ev.Usage.Input=payload.Usage.Prompt;if ev.Usage.Input==0{ev.Usage.Input=payload.Usage.Input}
				ev.Usage.Output=payload.Usage.Completion;if ev.Usage.Output==0{ev.Usage.Output=payload.Usage.Output}
				ev.Usage.CacheRead=payload.Usage.CacheRead;ev.Usage.Reasoning=payload.Usage.Reasoning;ev.Usage.ServedModel=payload.Model
				stats.Usage=ev.Usage
			}
		}
		if stats.FirstEventAt.IsZero()&&(ev.Kind==EventText||ev.Kind==EventTool){stats.FirstEventAt=ev.At}
		if err:=fn([]byte("data: "+data+"\n\n"),ev);err!=nil{return stats,err}
	}
	return stats,sc.Err()
}
