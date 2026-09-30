package protocol
import "encoding/json"
type Kind string
const(Text Kind="text";Image Kind="image";ToolCall Kind="tool_call";ToolResult Kind="tool_result")
type Part struct{Kind Kind `json:"kind"`;Text string `json:"text,omitempty"`;URL string `json:"url,omitempty"`;CallID string `json:"call_id,omitempty"`;Name string `json:"name,omitempty"`;Arguments json.RawMessage `json:"arguments,omitempty"`}
type Message struct{Role string `json:"role"`;Parts []Part `json:"parts"`}
type Request struct{Model string `json:"model"`;Messages []Message `json:"messages"`;Tools json.RawMessage `json:"tools,omitempty"`;Stream bool `json:"stream,omitempty"`;MaxTokens int `json:"max_tokens,omitempty"`;Temperature *float64 `json:"temperature,omitempty"`;Raw json.RawMessage `json:"-"`}
