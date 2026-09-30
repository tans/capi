package protocol

import (
	"strings"
	"testing"
)

func TestReadOpenAISSE(t *testing.T){
	src:="data: {\"model\":\"served-x\",\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: {\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2}}\n\ndata: [DONE]\n\n"
	var seen int
	stats,err:=ReadOpenAISSE(strings.NewReader(src),func(raw []byte,ev Event)error{seen++;return nil})
	if err!=nil{t.Fatal(err)}
	if seen!=3{t.Fatalf("events=%d",seen)}
	if stats.ServedModel!="served-x"||stats.Usage.Input!=3||stats.Usage.Output!=2{t.Fatalf("%+v",stats)}
}
