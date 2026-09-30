package protocol

import "encoding/json"

func AnthropicToOpenAI(body []byte)([]byte,error){
	var in map[string]any
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	out:=map[string]any{"model":in["model"],"stream":in["stream"]}
	if v,ok:=in["max_tokens"];ok{out["max_tokens"]=v}
	if sys,ok:=in["system"];ok{out["messages"]=[]any{map[string]any{"role":"system","content":sys}}}
	msgs,_:=out["messages"].([]any)
	if raw,ok:=in["messages"].([]any);ok{
		for _,item:=range raw{
			m,ok:=item.(map[string]any);if !ok{continue}
			role,_:=m["role"].(string)
			content:=m["content"]
			if blocks,ok:=content.([]any);ok{
				var text string
				var calls []any
				var toolResults []any
				for _,bv:=range blocks{
					b,_:=bv.(map[string]any);typ,_:=b["type"].(string)
					switch typ{
					case"text":if s,ok:=b["text"].(string);ok{text+=s}
					case"tool_use":
						args,_:=json.Marshal(b["input"])
						calls=append(calls,map[string]any{"id":b["id"],"type":"function","function":map[string]any{"name":b["name"],"arguments":string(args)}})
					case"tool_result":
						toolResults=append(toolResults,map[string]any{"role":"tool","tool_call_id":b["tool_use_id"],"content":b["content"]})
					}
				}
				if text!=""||len(calls)>0{msg:=map[string]any{"role":role,"content":text};if len(calls)>0{msg["tool_calls"]=calls};msgs=append(msgs,msg)}
				msgs=append(msgs,toolResults...)
				continue
			}
			msgs=append(msgs,map[string]any{"role":role,"content":content})
		}
	}
	out["messages"]=msgs
	if tools,ok:=in["tools"].([]any);ok{
		var converted []any
		for _,tv:=range tools{
			t,_:=tv.(map[string]any)
			converted=append(converted,map[string]any{"type":"function","function":map[string]any{"name":t["name"],"description":t["description"],"parameters":t["input_schema"]}})
		}
		out["tools"]=converted
	}
	return json.Marshal(out)
}

func OpenAIToAnthropic(body []byte)([]byte,error){return OpenAIResponseToAnthropic(body)}

func OpenAIResponseToAnthropic(body []byte)([]byte,error){
	var in struct{
		ID string `json:"id"`
		Model string `json:"model"`
		Choices []struct{
			Message struct{Content any `json:"content"`;ToolCalls []struct{ID string `json:"id"`;Function struct{Name string `json:"name"`;Arguments string `json:"arguments"`} `json:"function"`} `json:"tool_calls"`} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct{PromptTokens int `json:"prompt_tokens"`;CompletionTokens int `json:"completion_tokens"`} `json:"usage"`
	}
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	content:=[]map[string]any{};stop:="end_turn"
	if len(in.Choices)>0{
		if s,ok:=in.Choices[0].Message.Content.(string);ok&&s!=""{content=append(content,map[string]any{"type":"text","text":s})}
		for _,tc:=range in.Choices[0].Message.ToolCalls{var args any=map[string]any{};if tc.Function.Arguments!=""{_ = json.Unmarshal([]byte(tc.Function.Arguments),&args)};content=append(content,map[string]any{"type":"tool_use","id":tc.ID,"name":tc.Function.Name,"input":args})}
		if len(in.Choices[0].Message.ToolCalls)>0{stop="tool_use"}
	}
	return json.Marshal(map[string]any{"id":in.ID,"type":"message","role":"assistant","model":in.Model,"content":content,"stop_reason":stop,"usage":map[string]int{"input_tokens":in.Usage.PromptTokens,"output_tokens":in.Usage.CompletionTokens}})
}
