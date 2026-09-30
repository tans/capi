package ops

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"
)

func NewLogger(level string)*slog.Logger{lv:=slog.LevelInfo;switch level{case"debug":lv=slog.LevelDebug;case"warn":lv=slog.LevelWarn;case"error":lv=slog.LevelError};return slog.New(slog.NewJSONHandler(os.Stdout,&slog.HandlerOptions{Level:lv}))}
type Alerter struct{URL string;Client *http.Client;mu sync.Mutex;last map[string]time.Time}
func NewAlerter(url string)*Alerter{return &Alerter{URL:url,Client:&http.Client{Timeout:3*time.Second},last:map[string]time.Time{}}}
func(a *Alerter)Send(ctx context.Context,event,message string,fields map[string]any){
	if a.URL==""{return};a.mu.Lock();if t:=a.last[event];time.Since(t)<5*time.Minute{a.mu.Unlock();return};a.last[event]=time.Now();a.mu.Unlock()
	payload:=map[string]any{"service":"capi","event":event,"message":message,"timestamp":time.Now().UTC()};for k,v:=range fields{payload[k]=v};b,_:=json.Marshal(payload)
	req,_:=http.NewRequestWithContext(ctx,http.MethodPost,a.URL,bytes.NewReader(b));req.Header.Set("Content-Type","application/json");res,err:=a.Client.Do(req);if err==nil{io.Copy(io.Discard,res.Body);res.Body.Close()}
}
