package worker
import("context";"log/slog";"time";"github.com/tans/capi/internal/config";"github.com/tans/capi/internal/store")
type Worker struct{Cfg config.Config;Store *store.Store;Log *slog.Logger}
func New(cfg config.Config,st *store.Store,log *slog.Logger)*Worker{return &Worker{Cfg:cfg,Store:st,Log:log}}
func(w *Worker)Run(ctx context.Context){ticker:=time.NewTicker(time.Hour);defer ticker.Stop();for{select{case<-ctx.Done():return;case<-ticker.C:w.cleanup(ctx)}}}
func(w *Worker)cleanup(ctx context.Context){_,err:=w.Store.DB.ExecContext(ctx,`DELETE FROM sessions WHERE expires_at<?`,time.Now().UTC().Format(time.RFC3339Nano));if err!=nil{w.Log.Warn("session_cleanup_failed","error",err)}}
