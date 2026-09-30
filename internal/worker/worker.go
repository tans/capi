package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/tans/capi/internal/provider"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

type Worker struct {
	Cfg   config.Config
	Store *store.Store
	Log   *slog.Logger
	HTTP  *http.Client
}

func New(cfg config.Config, st *store.Store, log *slog.Logger) *Worker {
	return &Worker{Cfg: cfg, Store: st, Log: log, HTTP: &http.Client{Timeout: 20 * time.Second}}
}

func (w *Worker) Run(ctx context.Context) {
	video := time.NewTicker(2 * time.Second)
	cleanup := time.NewTicker(time.Hour)
	defer video.Stop()
	defer cleanup.Stop()
	w.cleanup(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-video.C:
			w.pollVideos(ctx)
		case <-cleanup.C:
			w.cleanup(ctx)
		}
	}
}

func (w *Worker) cleanup(ctx context.Context) {
	if err := w.Store.ExpireBillingLeases(ctx, time.Now()); err != nil {
		w.Log.Error("billing_lease_cleanup_failed", "error", err)
	}
	_, err := w.Store.DB.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at<?`, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		w.Log.Warn("session_cleanup_failed", "error", err)
	}
	rows, err := w.Store.DB.QueryContext(ctx, `SELECT id,path FROM files WHERE expires_at IS NOT NULL AND expires_at<?`, time.Now().UTC().Format(time.RFC3339Nano))
	if err == nil {
		type expiredFile struct{ id, path string }
		var files []expiredFile
		for rows.Next() {
			var id, path string
			if rows.Scan(&id, &path) == nil {
				files = append(files, expiredFile{id, path})
			}
		}
		rows.Close()
		for _, f := range files {
			if err := removeFile(f.path); err == nil || os.IsNotExist(err) {
				_, _ = w.Store.DB.ExecContext(ctx, `DELETE FROM files WHERE id=?`, f.id)
			}
		}
	}
}

var removeFile = os.Remove

func (w *Worker) pollVideos(ctx context.Context) {
	rows, err := w.Store.DB.QueryContext(ctx, `SELECT t.id,t.upstream_id,t.channel_id,CASE WHEN t.upstream_base='' THEN c.base_url ELSE t.upstream_base END,CASE WHEN t.upstream_key='' THEN c.api_key ELSE t.upstream_key END,t.channel_snapshot,CASE WHEN t.upstream_model='' THEN t.model ELSE t.upstream_model END FROM video_tasks t LEFT JOIN channels c ON c.id=t.channel_id WHERE t.status IN ('submitting','running','queued','processing') AND t.next_poll_at<=? LIMIT 20`, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		w.Log.Warn("video_poll_query_failed", "error", err)
		return
	}
	type task struct{ id, upstream, channel, base, key, snapshot, model string }
	var tasks []task
	for rows.Next() {
		var t task
		if rows.Scan(&t.id, &t.upstream, &t.channel, &t.base, &t.key, &t.snapshot, &t.model) == nil {
			tasks = append(tasks, t)
		}
	}
	rows.Close()
	for _, t := range tasks {
		w.pollConfigured(ctx, t.id, t.upstream, t.base, t.key, t.snapshot, t.model)
	}
}

func (w *Worker) pollOne(ctx context.Context, id, upstream, base, key string) {
	w.pollConfigured(ctx, id, upstream, base, key, "{}", "")
}
func (w *Worker) pollConfigured(ctx context.Context, id, upstream, base, key, snapshot, model string) {
	if upstream == "" {
		return
	}
	url := strings.TrimRight(base, "/")
	if strings.HasSuffix(url, "/v1") {
		url += "/tasks/" + upstream
	} else {
		url += "/v1/tasks/" + upstream
	}
	cfg, err := provider.DecodeChannelConfig(snapshot)
	if err != nil {
		w.deferTask(ctx, id, "invalid_channel_snapshot", time.Minute)
		return
	}
	video, err := provider.VideoConfig(cfg)
	if err != nil {
		w.deferTask(ctx, id, "invalid_video_protocol", time.Minute)
		return
	}
	if video != nil {
		url = provider.EndpointURL(base, provider.ExpandEndpoint(video.Poll.Endpoint, upstream, model))
	} else if cfg.VideoStatusPath != "" {
		url = provider.EndpointURL(base, provider.ExpandEndpoint(cfg.VideoStatusPath, upstream, model))
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return
	}
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	ch := provider.Channel{BaseURL: base, APIKey: key, Config: cfg}
	if video != nil {
		provider.ApplyProtocolAuth(req, ch, video.Auth)
	} else {
		provider.ApplyChannelHeaders(req, ch)
	}
	res, err := w.HTTP.Do(req)
	if err != nil {
		w.deferTask(ctx, id, "network", 5*time.Second)
		return
	}
	body, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		w.deferTask(ctx, id, fmt.Sprintf("status_%d", res.StatusCode), 10*time.Second)
		return
	}
	if video != nil {
		body, err = provider.NormalizeVideoPoll(video, body)
		if err != nil {
			w.deferTask(ctx, id, "invalid_video_result", 10*time.Second)
			return
		}
	}
	var payload map[string]any
	if json.Unmarshal(body, &payload) != nil {
		w.deferTask(ctx, id, "invalid_json", 10*time.Second)
		return
	}
	status, _ := payload["status"].(string)
	status = strings.ToLower(status)
	if status == "" {
		status = "running"
	}
	now := time.Now().UTC()
	next := now.Add(3 * time.Second)
	switch status {
	case "succeeded", "completed", "success":
		status = "succeeded"
		next = now
	case "failed", "error", "canceled", "cancelled":
		status = "failed"
		next = now
	default:
		status = "running"
	}
	taskError := ""
	if value := payload["error"]; value != nil {
		taskError = fmt.Sprint(value)
	}
	_, err = w.Store.DB.ExecContext(ctx, `UPDATE video_tasks SET status=?,result_json=?,error=?,next_poll_at=?,updated_at=? WHERE id=?`, status, string(body), taskError, next.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano), id)
	if err != nil {
		w.Log.Warn("video_task_update_failed", "task_id", id, "error", err)
	}
}
func (w *Worker) deferTask(ctx context.Context, id, reason string, d time.Duration) {
	now := time.Now().UTC()
	_, _ = w.Store.DB.ExecContext(ctx, `UPDATE video_tasks SET error=?,next_poll_at=?,updated_at=? WHERE id=?`, reason, now.Add(d).Format(time.RFC3339Nano), now.Format(time.RFC3339Nano), id)
}
