package router
import("testing";"github.com/tans/capi/internal/provider")
func TestPriority(t *testing.T){r:=New();c,err:=r.Choose([]provider.Channel{{ID:"low",Priority:1,Weight:1},{ID:"high",Priority:2,Weight:1}});if err!=nil||c.ID!="high"{t.Fatalf("got %v %v",c.ID,err)}}
