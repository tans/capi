package protocol

import (
	"encoding/json"
	"fmt"
)

type AnthropicStreamEncoder struct {
	Started      bool
	Model        string
	ID           string
	OutputTokens int64
	InputTokens  int64
	TextOpen     bool
	TextIndex    int
	ToolIndexes  map[int]int
	NextIndex    int
	UsedTool     bool
}

func (e *AnthropicStreamEncoder) Encode(ev Event) [][]byte {
	var out [][]byte
	emit:=func(name string,v any){b,_:=json.Marshal(v);out=append(out,[]byte("event: "+name+"\ndata: "+string(b)+"\n\n"))}
	if !e.Started {
		e.Started=true
		e.ToolIndexes=map[int]int{}
		emit("message_start",map[string]any{"type":"message_start","message":map[string]any{"id":e.ID,"type":"message","role":"assistant","model":e.Model,"content":[]any{},"stop_reason":nil,"stop_sequence":nil,"usage":map[string]any{"input_tokens":0,"output_tokens":0}}})
	}
	switch ev.Kind {
	case EventText:
		if !e.TextOpen {e.TextIndex=e.NextIndex;e.NextIndex++;e.TextOpen=true;emit("content_block_start",map[string]any{"type":"content_block_start","index":e.TextIndex,"content_block":map[string]any{"type":"text","text":""}})}
		idx:=e.TextIndex
		emit("content_block_delta",map[string]any{"type":"content_block_delta","index":idx,"delta":map[string]any{"type":"text_delta","text":ev.Text}})
	case EventTool:
		e.UsedTool=true
		for _,t:=range ev.Tools{
			idx,ok:=e.ToolIndexes[t.Index]
			if !ok {idx=e.NextIndex;e.NextIndex++;e.ToolIndexes[t.Index]=idx;emit("content_block_start",map[string]any{"type":"content_block_start","index":idx,"content_block":map[string]any{"type":"tool_use","id":t.ID,"name":t.Name,"input":map[string]any{}}})}
			if t.Arguments!="" {emit("content_block_delta",map[string]any{"type":"content_block_delta","index":idx,"delta":map[string]any{"type":"input_json_delta","partial_json":t.Arguments}})}
		}
	case EventUsage:
		e.InputTokens=ev.Usage.Input;e.OutputTokens=ev.Usage.Output
	case EventDone:
		if e.TextOpen {emit("content_block_stop",map[string]any{"type":"content_block_stop","index":e.TextIndex})}
		for _,idx:=range e.ToolIndexes{emit("content_block_stop",map[string]any{"type":"content_block_stop","index":idx})}
		reason:="end_turn";if e.UsedTool{reason="tool_use"}
		emit("message_delta",map[string]any{"type":"message_delta","delta":map[string]any{"stop_reason":reason,"stop_sequence":nil},"usage":map[string]any{"output_tokens":e.OutputTokens}})
		emit("message_stop",map[string]any{"type":"message_stop"})
	}
	return out
}

func OpenAIRequestToAnthropic(body []byte)([]byte,error){
	var in map[string]any
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	out:=map[string]any{"model":in["model"],"stream":in["stream"]}
	if n,ok:=in["max_tokens"];ok{out["max_tokens"]=n}else{out["max_tokens"]=1024}
	if s,ok:=in["system"];ok{out["system"]=s}
	var messages []any
	if raw,ok:=in["messages"].([]any);ok{
		for _,item:=range raw{
			m,ok:=item.(map[string]any);if !ok{continue}
			role,_:=m["role"].(string)
			if role=="system"{out["system"]=m["content"];continue}
			if role=="tool"{
				messages=append(messages,map[string]any{"role":"user","content":[]any{map[string]any{"type":"tool_result","tool_use_id":m["tool_call_id"],"content":m["content"]}}});continue
			}
			if role=="assistant"{
				var parts []any
				if txt,ok:=m["content"].(string);ok&&txt!=""{parts=append(parts,map[string]any{"type":"text","text":txt})}
				if calls,ok:=m["tool_calls"].([]any);ok{for _,cv:=range calls{cm,_:=cv.(map[string]any);fn,_:=cm["function"].(map[string]any);args:=map[string]any{};if s,ok:=fn["arguments"].(string);ok&&s!=""{_ = json.Unmarshal([]byte(s),&args)};parts=append(parts,map[string]any{"type":"tool_use","id":cm["id"],"name":fn["name"],"input":args})}}
				messages=append(messages,map[string]any{"role":"assistant","content":parts});continue
			}
			messages=append(messages,map[string]any{"role":role,"content":m["content"]})
		}
	}
	out["messages"]=messages
	if tools,ok:=in["tools"].([]any);ok{
		var converted []any
		for _,tv:=range tools{tm,_:=tv.(map[string]any);fn,_:=tm["function"].(map[string]any);converted=append(converted,map[string]any{"name":fn["name"],"description":fn["description"],"input_schema":fn["parameters"]})}
		out["tools"]=converted
	}
	return json.Marshal(out)
}

func AnthropicResponseToOpenAI(body []byte)([]byte,error){
	var in struct{ID string `json:"id"`;Model string `json:"model"`;Content []struct{Type string `json:"type"`;Text string `json:"text"`;ID string `json:"id"`;Name string `json:"name"`;Input json.RawMessage `json:"input"`} `json:"content"`;StopReason string `json:"stop_reason"`;Usage struct{Input int64 `json:"input_tokens"`;Output int64 `json:"output_tokens"`} `json:"usage"`}
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	if in.ID==""{return nil,fmt.Errorf("anthropic response missing id")}
	text:="";var calls []any
	for _,p:=range in.Content{switch p.Type{case"text":text+=p.Text;case"tool_use":args:=string(p.Input);if args==""{args="{}"};calls=append(calls,map[string]any{"id":p.ID,"type":"function","function":map[string]any{"name":p.Name,"arguments":args}})}}
	msg:=map[string]any{"role":"assistant","content":text};if len(calls)>0{msg["tool_calls"]=calls}
	finish:="stop";if in.StopReason=="tool_use"{finish="tool_calls"}
	return json.Marshal(map[string]any{"id":in.ID,"object":"chat.completion","model":in.Model,"choices":[]any{map[string]any{"index":0,"message":msg,"finish_reason":finish}},"usage":map[string]any{"prompt_tokens":in.Usage.Input,"completion_tokens":in.Usage.Output}})
}
