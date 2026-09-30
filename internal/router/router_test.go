package router

import (
	"net/http"
	"testing"
	"time"

	"github.com/tans/capi/internal/provider"
)

func TestPriority(t *testing.T){
	r:=New()
	c,err:=r.Choose([]provider.Channel{{ID:"low",Priority:1,Weight:1},{ID:"high",Priority:2,Weight:1}})
	if err!=nil||c.ID!="high"{t.Fatalf("got %v %v",c.ID,err)}
}

func TestAffinity(t *testing.T){
	r:=New()
	cs:=[]provider.Channel{{ID:"a",Priority:1,Weight:1},{ID:"b",Priority:1,Weight:1}}
	first,err:=r.ChooseFor(cs,"session-1");if err!=nil{t.Fatal(err)}
	second,err:=r.ChooseFor(cs,"session-1");if err!=nil{t.Fatal(err)}
	if first.ID!=second.ID{t.Fatalf("affinity changed: %s -> %s",first.ID,second.ID)}
}

func TestRetryAfter(t *testing.T){
	h:=http.Header{};h.Set("Retry-After","5")
	reason,d:=ClassifyFailure(429,h,nil)
	if reason!="retry_after"||d<4*time.Second||d>6*time.Second{t.Fatalf("%s %s",reason,d)}
}
