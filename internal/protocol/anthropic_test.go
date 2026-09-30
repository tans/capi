package protocol

import("strings";"testing")
func TestAnthropicToOpenAI(t *testing.T){b,err:=AnthropicToOpenAI([]byte(`{"model":"x","max_tokens":32,"messages":[{"role":"user","content":"hi"}]}`));if err!=nil||!strings.Contains(string(b),`"messages"`){t.Fatalf("%s %v",b,err)}}
