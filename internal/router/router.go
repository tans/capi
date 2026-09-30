package router

import("errors";"math/rand";"sync";"time";"github.com/tans/capi/internal/provider")
type Rest struct{Until time.Time;Reason string}
type Router struct{mu sync.Mutex;resting map[string]Rest;rnd *rand.Rand}
func New()*Router{return &Router{resting:map[string]Rest{},rnd:rand.New(rand.NewSource(time.Now().UnixNano()))}}
func(r *Router)Choose(channels []provider.Channel)(provider.Channel,error){r.mu.Lock();defer r.mu.Unlock();now:=time.Now();bestPriority:=-1<<30;var candidates []provider.Channel;for _,c:=range channels{if rest,ok:=r.resting[c.ID];ok{if now.Before(rest.Until){continue};delete(r.resting,c.ID)};if c.Priority>bestPriority{bestPriority=c.Priority;candidates=[]provider.Channel{c}}else if c.Priority==bestPriority{candidates=append(candidates,c)}};if len(candidates)==0{return provider.Channel{},errors.New("no available channel")};total:=0;for _,c:=range candidates{if c.Weight>0{total+=c.Weight}};if total<=0{return candidates[0],nil};n:=r.rnd.Intn(total);for _,c:=range candidates{w:=c.Weight;if w<1{continue};if n<w{return c,nil};n-=w};return candidates[0],nil}
func(r *Router)Rest(channelID,reason string,d time.Duration){r.mu.Lock();defer r.mu.Unlock();r.resting[channelID]=Rest{Until:time.Now().Add(d),Reason:reason}}
func Backoff(status int)(string,time.Duration){switch status{case 402:return"credit",30*time.Minute;case 429:return"rate",time.Minute;case 401,403:return"auth",10*time.Minute;default:if status>=500{return"upstream",time.Minute}};return"",0}
