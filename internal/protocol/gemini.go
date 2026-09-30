package protocol

import (
	"encoding/json"
)

func GeminiToOpenAI(body []byte,model string,stream bool)([]byte,error){
	var in struct{
		Contents []struct{Role string `json:"role"`;Parts []struct{Text string `json:"text"`} `json:"parts"`} `json:"contents"`
		SystemInstruction *struct{Parts []struct{Text string `json:"text"`} `json:"parts"`} `json:"systemInstruction"`
		GenerationConfig struct{MaxOutputTokens int `json:"maxOutputTokens"`;Temperature *float64 `json:"temperature"`} `json:"generationConfig"`
	}
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	var messages []map[string]any
	if in.SystemInstruction!=nil{txt:="";for _,p:=range in.SystemInstruction.Parts{txt+=p.Text};if txt!=""{messages=append(messages,map[string]any{"role":"system","content":txt})}}
	for _,m:=range in.Contents{role:=m.Role;if role=="model"{role="assistant"};txt:="";for _,p:=range m.Parts{txt+=p.Text};messages=append(messages,map[string]any{"role":role,"content":txt})}
	out:=map[string]any{"model":model,"messages":messages,"stream":stream}
	if in.GenerationConfig.MaxOutputTokens>0{out["max_tokens"]=in.GenerationConfig.MaxOutputTokens}
	if in.GenerationConfig.Temperature!=nil{out["temperature"]=*in.GenerationConfig.Temperature}
	return json.Marshal(out)
}

func OpenAIToGemini(body []byte)([]byte,error){
	var in struct{Model string `json:"model"`;Choices []struct{Message struct{Content string `json:"content"`} `json:"message"`;FinishReason string `json:"finish_reason"`} `json:"choices"`;Usage struct{Prompt int64 `json:"prompt_tokens"`;Completion int64 `json:"completion_tokens"`} `json:"usage"`}
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	text:="";finish:="STOP";if len(in.Choices)>0{text=in.Choices[0].Message.Content}
	out:=map[string]any{"candidates":[]any{map[string]any{"content":map[string]any{"role":"model","parts":[]any{map[string]any{"text":text}}},"finishReason":finish}},"usageMetadata":map[string]any{"promptTokenCount":in.Usage.Prompt,"candidatesTokenCount":in.Usage.Completion,"totalTokenCount":in.Usage.Prompt+in.Usage.Completion},"modelVersion":in.Model}
	return json.Marshal(out)
}

type GeminiStreamEncoder struct{Model string}
func(e *GeminiStreamEncoder)Encode(ev Event)[]byte{
	var v any
	switch ev.Kind{
	case EventText:v=map[string]any{"candidates":[]any{map[string]any{"content":map[string]any{"role":"model","parts":[]any{map[string]any{"text":ev.Text}}}}},"modelVersion":e.Model}
	case EventUsage:v=map[string]any{"candidates":[]any{},"usageMetadata":map[string]any{"promptTokenCount":ev.Usage.Input,"candidatesTokenCount":ev.Usage.Output,"totalTokenCount":ev.Usage.Input+ev.Usage.Output},"modelVersion":e.Model}
	case EventDone:return nil
	default:return nil
	}
	b,_:=json.Marshal(v);return []byte("data: "+string(b)+"\n\n")
}

func OpenAIRequestToGemini(body []byte)([]byte,string,error){
	var in struct{Model string `json:"model"`;Messages []struct{Role string `json:"role"`;Content any `json:"content"`} `json:"messages"`;MaxTokens int `json:"max_tokens"`;Temperature *float64 `json:"temperature"`}
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,"",err}
	var contents []map[string]any;var sys []map[string]any
	for _,m:=range in.Messages{txt:="";switch v:=m.Content.(type){case string:txt=v};if m.Role=="system"{sys=append(sys,map[string]any{"text":txt});continue};role:=m.Role;if role=="assistant"{role="model"};contents=append(contents,map[string]any{"role":role,"parts":[]any{map[string]any{"text":txt}}})}
	out:=map[string]any{"contents":contents};if len(sys)>0{out["systemInstruction"]=map[string]any{"parts":sys}};cfg:=map[string]any{};if in.MaxTokens>0{cfg["maxOutputTokens"]=in.MaxTokens};if in.Temperature!=nil{cfg["temperature"]=*in.Temperature};if len(cfg)>0{out["generationConfig"]=cfg}
	b,err:=json.Marshal(out);return b,in.Model,err
}

func GeminiResponseToOpenAI(body []byte)([]byte,error){
	var in struct{
		ModelVersion string `json:"modelVersion"`
		Candidates []struct{Content struct{Parts []struct{Text string `json:"text"`} `json:"parts"`} `json:"content"`;FinishReason string `json:"finishReason"`} `json:"candidates"`
		Usage struct{Prompt int64 `json:"promptTokenCount"`;Candidates int64 `json:"candidatesTokenCount"`} `json:"usageMetadata"`
	}
	if err:=json.Unmarshal(body,&in);err!=nil{return nil,err}
	text:="";for _,cand:=range in.Candidates{for _,p:=range cand.Content.Parts{text+=p.Text}}
	return json.Marshal(map[string]any{"id":"gemini","object":"chat.completion","model":in.ModelVersion,"choices":[]any{map[string]any{"index":0,"message":map[string]any{"role":"assistant","content":text},"finish_reason":"stop"}},"usage":map[string]any{"prompt_tokens":in.Usage.Prompt,"completion_tokens":in.Usage.Candidates}})
}
