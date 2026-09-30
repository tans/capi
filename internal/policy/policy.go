package policy

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type Decision struct{Allow bool;Model string;Body []byte;Reason string}
type Engine struct{JEVURL string;Client *http.Client;email *regexp.Regexp;phone *regexp.Regexp}
func New(jevURL string)*Engine{return &Engine{JEVURL:jevURL,Client:&http.Client{Timeout:5*time.Second},email:regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`),phone:regexp.MustCompile(`\b(?:\+?\d[\d .\-]{7,}\d)\b`)}}
func(e *Engine)Apply(ctx context.Context,body []byte,model string,redact bool)Decision{
	out:=append([]byte(nil),body...);if redact{out=e.email.ReplaceAll(out,[]byte("[REDACTED_EMAIL]"));out=e.phone.ReplaceAll(out,[]byte("[REDACTED_PHONE]"))};d:=Decision{Allow:true,Model:model,Body:out};if e.JEVURL==""{return d}
	payload,_:=json.Marshal(map[string]any{"state":string(out),"questions":map[string]any{"allow":map[string]any{"type":"boolean","instructions":"Is this request safe to forward to an AI provider?"}}})
	req,err:=http.NewRequestWithContext(ctx,http.MethodPost,strings.TrimRight(e.JEVURL,"/")+"/v1/evaluate",bytes.NewReader(payload));if err!=nil{return d};req.Header.Set("Content-Type","application/json");res,err:=e.Client.Do(req);if err!=nil{return d};defer res.Body.Close()
	var r struct{Answers map[string]struct{Probability float64 `json:"probability"`} `json:"answers"`;Model string `json:"route_model"`}
	if json.NewDecoder(res.Body).Decode(&r)==nil&&res.StatusCode>=200&&res.StatusCode<300{if a,ok:=r.Answers["allow"];ok&&a.Probability<0.2{d.Allow=false;d.Reason="blocked_by_jev"};if r.Model!=""{d.Model=r.Model}}
	return d
}
