package protocol

import (
	"strings"
	"testing"
)

func TestOpenAIToolStreamToEvent(t *testing.T){
	src:=`data: {"model":"m","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"lookup","arguments":"{\"q\":"}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"tokyo\"}"}}]}}]}

data: [DONE]

`
	var got []ToolDelta
	_,err:=ReadOpenAISSE(strings.NewReader(src),func(_ []byte,ev Event)error{if ev.Kind==EventTool{got=append(got,ev.Tools...)};return nil})
	if err!=nil{t.Fatal(err)}
	if len(got)!=2||got[0].Name!="lookup"||got[0].ID!="call_1"||got[1].Arguments!=`"tokyo"}`{t.Fatalf("%+v",got)}
}

func TestAnthropicToolStreamRoundTrip(t *testing.T){
	enc:=&AnthropicStreamEncoder{ID:"msg_1",Model:"m"}
	var b strings.Builder
	for _,ev:=range []Event{
		{Kind:EventTool,Tools:[]ToolDelta{{Index:0,ID:"call_1",Name:"lookup"}}},
		{Kind:EventTool,Tools:[]ToolDelta{{Index:0,ID:"call_1",Name:"lookup",Arguments:`{"q":"tokyo"}`}}},
		{Kind:EventDone},
	}{for _,chunk:=range enc.Encode(ev){b.Write(chunk)}}
	if !strings.Contains(b.String(),`"type":"tool_use"`)||!strings.Contains(b.String(),`"partial_json":"{\"q\":\"tokyo\"}"`){t.Fatal(b.String())}
	var tools []ToolDelta
	_,err:=ReadAnthropicSSE(strings.NewReader(b.String()),func(ev Event)error{if ev.Kind==EventTool{tools=append(tools,ev.Tools...)};return nil})
	if err!=nil{t.Fatal(err)}
	if len(tools)<2||tools[0].Name!="lookup"{t.Fatalf("%+v",tools)}
}

func TestGeminiFunctionCallToEvent(t *testing.T){
	src:=`data: {"modelVersion":"m","candidates":[{"content":{"parts":[{"functionCall":{"name":"lookup","args":{"q":"tokyo"}}}]}}]}

`
	var got []ToolDelta
	_,err:=ReadGeminiSSE(strings.NewReader(src),func(ev Event)error{if ev.Kind==EventTool{got=append(got,ev.Tools...)};return nil})
	if err!=nil{t.Fatal(err)}
	if len(got)!=1||got[0].Name!="lookup"||!strings.Contains(got[0].Arguments,"tokyo"){t.Fatalf("%+v",got)}
	b:=(&GeminiStreamEncoder{Model:"m"}).Encode(Event{Kind:EventTool,Tools:[]ToolDelta{{Name:"lookup",Arguments:`{"q":"tokyo"}`}}})
	if !strings.Contains(string(b),"functionCall")||!strings.Contains(string(b),"lookup"){t.Fatal(string(b))}
}

func TestAnthropicToolRequestToOpenAI(t *testing.T){
	in:=[]byte(`{"model":"claude","max_tokens":100,"tools":[{"name":"lookup","description":"find","input_schema":{"type":"object","properties":{"q":{"type":"string"}}}}],"messages":[{"role":"assistant","content":[{"type":"tool_use","id":"call_1","name":"lookup","input":{"q":"tokyo"}}]},{"role":"user","content":[{"type":"tool_result","tool_use_id":"call_1","content":"sunny"}]}]}`)
	out,err:=AnthropicToOpenAI(in);if err!=nil{t.Fatal(err)}
	s:=string(out)
	if !strings.Contains(s,`"type":"function"`)||!strings.Contains(s,`"tool_call_id":"call_1"`){t.Fatal(s)}
}

func TestGeminiToolsToOpenAI(t *testing.T){
	in:=[]byte(`{"tools":[{"functionDeclarations":[{"name":"lookup","description":"find","parameters":{"type":"object"}}]}],"contents":[{"role":"model","parts":[{"functionCall":{"name":"lookup","args":{"q":"tokyo"}}}]}]}`)
	out,err:=GeminiToOpenAI(in,"gemini",false);if err!=nil{t.Fatal(err)}
	s:=string(out)
	if !strings.Contains(s,`"type":"function"`)||!strings.Contains(s,`"tool_calls"`){t.Fatal(s)}
}
