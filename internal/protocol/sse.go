package protocol

import (
	"bufio"
	"bytes"
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
	sc:=bufio.NewScanner(r);sc.Buffer(make([]byte,0,64<<10),32<<20)
	var stats StreamStats
	var lines []string
	flush:=func()error{
		if len(lines)==0{return nil}
		raw:=[]byte(strings.Join(lines,"\n")+"\n\n")
		var data []string
		for _,line:=range lines{if strings.HasPrefix(line,"data:"){data=append(data,strings.TrimSpace(strings.TrimPrefix(line,"data:")))}}
		lines=nil
		if len(data)==0{return fn(raw,Event{At:time.Now()})}
		payloadText:=strings.Join(data,"\n")
		if payloadText=="[DONE]"{return fn(raw,Event{Kind:EventDone,At:time.Now()})}
		ev:=Event{At:time.Now()}
		var payload struct{
			Type string `json:"type"`
			Model string `json:"model"`
			Delta string `json:"delta"`
			Choices []struct{Delta struct{Content string `json:"content"`;ToolCalls []any `json:"tool_calls"`} `json:"delta"`} `json:"choices"`
			Usage *struct{Prompt int64 `json:"prompt_tokens"`;Completion int64 `json:"completion_tokens"`;Input int64 `json:"input_tokens"`;Output int64 `json:"output_tokens"`;CacheRead int64 `json:"cache_read_input_tokens"`;Reasoning int64 `json:"reasoning_tokens"`} `json:"usage"`
			Response *struct{Model string `json:"model"`;Usage *struct{Input int64 `json:"input_tokens"`;Output int64 `json:"output_tokens"`} `json:"usage"`} `json:"response"`
		}
		if json.Unmarshal([]byte(payloadText),&payload)==nil{
			if payload.Model!=""{stats.ServedModel=payload.Model}
			if payload.Response!=nil&&payload.Response.Model!=""{stats.ServedModel=payload.Response.Model}
			if len(payload.Choices)>0&&payload.Choices[0].Delta.Content!=""{ev.Kind=EventText;ev.Text=payload.Choices[0].Delta.Content}
			if strings.Contains(payload.Type,"output_text.delta")&&payload.Delta!=""{ev.Kind=EventText;ev.Text=payload.Delta}
			if payload.Usage!=nil{
				ev.Kind=EventUsage;ev.Usage.Input=payload.Usage.Prompt;if ev.Usage.Input==0{ev.Usage.Input=payload.Usage.Input};ev.Usage.Output=payload.Usage.Completion;if ev.Usage.Output==0{ev.Usage.Output=payload.Usage.Output};ev.Usage.CacheRead=payload.Usage.CacheRead;ev.Usage.Reasoning=payload.Usage.Reasoning;stats.Usage=ev.Usage
			}
			if payload.Response!=nil&&payload.Response.Usage!=nil{ev.Kind=EventUsage;ev.Usage.Input=payload.Response.Usage.Input;ev.Usage.Output=payload.Response.Usage.Output;stats.Usage=ev.Usage}
		}
		if stats.FirstEventAt.IsZero()&&(ev.Kind==EventText||ev.Kind==EventTool){stats.FirstEventAt=ev.At}
		return fn(raw,ev)
	}
	for sc.Scan(){line:=sc.Text();if line==""{if err:=flush();err!=nil{return stats,err};continue};lines=append(lines,line)}
	if err:=flush();err!=nil{return stats,err}
	return stats,sc.Err()
}

func RestoreSSE(raw []byte,restore func(string)string)[]byte{
	if restore==nil{return raw}
	lines:=bytes.Split(raw,[]byte("\n"))
	for i,line:=range lines{if bytes.HasPrefix(line,[]byte("data:")){prefix:=[]byte("data:");rest:=strings.TrimSpace(string(line[len(prefix):]));if rest!=""&&rest!="[DONE]"{lines[i]=[]byte("data: "+restore(rest))}}}
	return bytes.Join(lines,[]byte("\n"))
}
