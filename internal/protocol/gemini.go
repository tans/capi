package protocol

import "encoding/json"

func GeminiToOpenAI(body []byte,model string,stream bool)([]byte,error){
	var in struct{
		Contents []struct{
			Role string `json:"role"`
			Parts []struct{
				Text string `json:"text"`
				FunctionCall *struct{Name string `json:"name"`;Args json.RawMessage `json:"args"`} `json:"functionCall"`
				FunctionResponse *struct{Name string `json:"name"`;Response json.RawMessage `json:"response"`} `json:"functionResponse"`
			} `json:"parts"`
		} `json:"contents"`
		SystemInstruction *struct{Parts []struct{Text string `json:"text"`} `json:"parts"`} `json:"systemInstruction"`
		Tools []struct{FunctionDeclarations []struct{Name string `json:"name"`;Description string `json:"description"`;Parameters json.RawMessage `json:"parameters"`} `json:"functionDeclarations"`} `json:"tools"`
		GenerationConfig struct{MaxOutputTokens int `json:"maxOutputTokens"`;Temperature *float64 `json:"temperature"`} `json:"generationConfig"`
	}
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	var messages []map[string]any
	if in.SystemInstruction!=nil{txt:="";for _,p:=range in.SystemInstruction.Parts{txt+=p.Text};if txt!=""{messages=append(messages,map[string]any{"role":"system","content":txt})}}
	for ci,m:=range in.Contents{
		role:=m.Role;if role=="model"{role="assistant"}
		txt:="";var calls []any
		for pi,p:=range m.Parts{
			txt+=p.Text
			if p.FunctionCall!=nil{args:=string(p.FunctionCall.Args);if args==""{args="{}"};calls=append(calls,map[string]any{"id":geminiCallID(ci,pi,p.FunctionCall.Name),"type":"function","function":map[string]any{"name":p.FunctionCall.Name,"arguments":args}})}
			if p.FunctionResponse!=nil{content:=string(p.FunctionResponse.Response);if content==""{content="{}"};messages=append(messages,map[string]any{"role":"tool","tool_call_id":geminiCallID(max(ci-1,0),pi,p.FunctionResponse.Name),"content":content})}
		}
		if txt!=""||len(calls)>0{msg:=map[string]any{"role":role,"content":txt};if len(calls)>0{msg["tool_calls"]=calls};messages=append(messages,msg)}
	}
	out:=map[string]any{"model":model,"messages":messages,"stream":stream}
	if in.GenerationConfig.MaxOutputTokens>0{out["max_tokens"]=in.GenerationConfig.MaxOutputTokens}
	if in.GenerationConfig.Temperature!=nil{out["temperature"]=*in.GenerationConfig.Temperature}
	var tools []any
	for _,group:=range in.Tools{for _,fn:=range group.FunctionDeclarations{var params any=map[string]any{};if len(fn.Parameters)>0{_ = json.Unmarshal(fn.Parameters,&params)};tools=append(tools,map[string]any{"type":"function","function":map[string]any{"name":fn.Name,"description":fn.Description,"parameters":params}})}}
	if len(tools)>0{out["tools"]=tools}
	return json.Marshal(out)
}

func OpenAIToGemini(body []byte)([]byte,error){
	var in struct{
		Model string `json:"model"`
		Choices []struct{Message struct{Content string `json:"content"`;ToolCalls []struct{ID string `json:"id"`;Function struct{Name string `json:"name"`;Arguments string `json:"arguments"`} `json:"function"`} `json:"tool_calls"`} `json:"message"`;FinishReason string `json:"finish_reason"`} `json:"choices"`
		Usage struct{Prompt int64 `json:"prompt_tokens"`;Completion int64 `json:"completion_tokens"`} `json:"usage"`
	}
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	var parts []any
	if len(in.Choices)>0{
		if in.Choices[0].Message.Content!=""{parts=append(parts,map[string]any{"text":in.Choices[0].Message.Content})}
		for _,tc:=range in.Choices[0].Message.ToolCalls{var args any=map[string]any{};if tc.Function.Arguments!=""{_ = json.Unmarshal([]byte(tc.Function.Arguments),&args)};parts=append(parts,map[string]any{"functionCall":map[string]any{"name":tc.Function.Name,"args":args}})}
	}
	out:=map[string]any{"candidates":[]any{map[string]any{"content":map[string]any{"role":"model","parts":parts},"finishReason":"STOP"}},"usageMetadata":map[string]any{"promptTokenCount":in.Usage.Prompt,"candidatesTokenCount":in.Usage.Completion,"totalTokenCount":in.Usage.Prompt+in.Usage.Completion},"modelVersion":in.Model}
	return json.Marshal(out)
}

type GeminiStreamEncoder struct{Model string}
func(e *GeminiStreamEncoder)Encode(ev Event)[]byte{
	var v any
	switch ev.Kind{
	case EventText:v=map[string]any{"candidates":[]any{map[string]any{"content":map[string]any{"role":"model","parts":[]any{map[string]any{"text":ev.Text}}}}},"modelVersion":e.Model}
	case EventTool:
		var parts []any
		for _,t:=range ev.Tools{var args any=map[string]any{};if t.Arguments!=""{_ = json.Unmarshal([]byte(t.Arguments),&args)};parts=append(parts,map[string]any{"functionCall":map[string]any{"name":t.Name,"args":args}})}
		v=map[string]any{"candidates":[]any{map[string]any{"content":map[string]any{"role":"model","parts":parts}}},"modelVersion":e.Model}
	case EventUsage:v=map[string]any{"candidates":[]any{},"usageMetadata":map[string]any{"promptTokenCount":ev.Usage.Input,"candidatesTokenCount":ev.Usage.Output,"totalTokenCount":ev.Usage.Input+ev.Usage.Output},"modelVersion":e.Model}
	case EventDone:return nil
	default:return nil
	}
	b,_:=json.Marshal(v);return []byte("data: "+string(b)+"\n\n")
}

func OpenAIRequestToGemini(body []byte)([]byte,string,error){
	var in map[string]any
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,"",err}
	model,_:=in["model"].(string)
	var contents []any;var sys []any
	if msgs,ok:=in["messages"].([]any);ok{
		for _,mv:=range msgs{
			m,_:=mv.(map[string]any);role,_:=m["role"].(string)
			if role=="system"{if txt,ok:=m["content"].(string);ok{sys=append(sys,map[string]any{"text":txt})};continue}
			if role=="tool"{name:="tool";if s,ok:=m["name"].(string);ok&&s!=""{name=s};var response any=m["content"];contents=append(contents,map[string]any{"role":"user","parts":[]any{map[string]any{"functionResponse":map[string]any{"name":name,"response":response}}}});continue}
			gRole:=role;if role=="assistant"{gRole="model"}
			var parts []any
			if txt,ok:=m["content"].(string);ok&&txt!=""{parts=append(parts,map[string]any{"text":txt})}
			if calls,ok:=m["tool_calls"].([]any);ok{for _,cv:=range calls{cm,_:=cv.(map[string]any);fn,_:=cm["function"].(map[string]any);var args any=map[string]any{};if s,ok:=fn["arguments"].(string);ok&&s!=""{_ = json.Unmarshal([]byte(s),&args)};parts=append(parts,map[string]any{"functionCall":map[string]any{"name":fn["name"],"args":args}})}}
			contents=append(contents,map[string]any{"role":gRole,"parts":parts})
		}
	}
	out:=map[string]any{"contents":contents}
	if len(sys)>0{out["systemInstruction"]=map[string]any{"parts":sys}}
	cfg:=map[string]any{};if v,ok:=in["max_tokens"];ok{cfg["maxOutputTokens"]=v};if v,ok:=in["temperature"];ok{cfg["temperature"]=v};if len(cfg)>0{out["generationConfig"]=cfg}
	if tools,ok:=in["tools"].([]any);ok{
		var decl []any
		for _,tv:=range tools{tm,_:=tv.(map[string]any);fn,_:=tm["function"].(map[string]any);decl=append(decl,map[string]any{"name":fn["name"],"description":fn["description"],"parameters":fn["parameters"]})}
		if len(decl)>0{out["tools"]=[]any{map[string]any{"functionDeclarations":decl}}}
	}
	b,err:=json.Marshal(out);return b,model,err
}

func GeminiResponseToOpenAI(body []byte)([]byte,error){
	var in struct{
		ModelVersion string `json:"modelVersion"`
		Candidates []struct{Content struct{Parts []struct{Text string `json:"text"`;FunctionCall *struct{Name string `json:"name"`;Args json.RawMessage `json:"args"`} `json:"functionCall"`} `json:"parts"`} `json:"content"`;FinishReason string `json:"finishReason"`} `json:"candidates"`
		Usage struct{Prompt int64 `json:"promptTokenCount"`;Candidates int64 `json:"candidatesTokenCount"`} `json:"usageMetadata"`
	}
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	text:="";var calls []any
	for ci,cand:=range in.Candidates{for pi,p:=range cand.Content.Parts{text+=p.Text;if p.FunctionCall!=nil{args:=string(p.FunctionCall.Args);if args==""{args="{}"};calls=append(calls,map[string]any{"id":geminiCallID(ci,pi,p.FunctionCall.Name),"type":"function","function":map[string]any{"name":p.FunctionCall.Name,"arguments":args}})}}}
	msg:=map[string]any{"role":"assistant","content":text};if len(calls)>0{msg["tool_calls"]=calls}
	finish:="stop";if len(calls)>0{finish="tool_calls"}
	return json.Marshal(map[string]any{"id":"gemini","object":"chat.completion","model":in.ModelVersion,"choices":[]any{map[string]any{"index":0,"message":msg,"finish_reason":finish}},"usage":map[string]any{"prompt_tokens":in.Usage.Prompt,"completion_tokens":in.Usage.Candidates}})
}

func geminiCallID(ci,pi int,name string)string{return "gemini_"+name+"_"+itoa(ci)+"_"+itoa(pi)}
func itoa(n int)string{if n==0{return"0"};digits:="";for n>0{digits=string(rune('0'+n%10))+digits;n/=10};return digits}
func max(a,b int)int{if a>b{return a};return b}
