package worker

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/store"
)

func TestVideoPollingSurvivesChannelDeletion(t *testing.T) {
	called := false
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.URL.Path != "/custom/provider-video/jobs/job-1" || r.Header.Get("X-Secret") != "selected-key" || r.Header.Get("X-Tenant") != "original-tenant" {
			t.Errorf("snapshot not used: %s %v", r.URL, r.Header)
		}
		io.WriteString(w, `{"state":"done","output":{"url":"https://example.test/result.mp4"}}`)
	}))
	defer up.Close()
	st, err := store.Open(t.TempDir() + "/test.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = st.DB.Exec(`INSERT INTO workspaces(id,name,created_at) VALUES('ws','Workspace',?)`, now)
	if err != nil {
		t.Fatal(err)
	}
	_, err = st.DB.Exec(`INSERT INTO channels(id,workspace_id,name,base_url,api_key,created_at,updated_at) VALUES('channel','ws','Channel',?,'new-key',?,?)`, up.URL, now, now)
	if err != nil {
		t.Fatal(err)
	}
	cfg := provider.ChannelConfig{Headers: map[string]string{"X-Tenant": "original-tenant"}, VideoProtocolConfig: json.RawMessage(`{"version":1,"auth":{"type":"api-key-header","header":"X-Secret"},"submit":{"endpoint":"/start","request":{"text":{"from":"prompt"}}},"taskIdPath":"task.id","poll":{"endpoint":"/custom/{model}/jobs/{id}","statusPath":"state","resultUrlPath":"output.url","successStatuses":["done"]}}`)}
	snapshot, _ := json.Marshal(cfg)
	_, err = st.DB.Exec(`INSERT INTO video_tasks(id,workspace_id,api_key_id,channel_id,upstream_id,model,status,next_poll_at,created_at,updated_at,upstream_key,channel_snapshot,upstream_base,upstream_model) VALUES('task','ws','key','channel','job-1','public-video','queued',?,?,?,?,?,?,?)`, now, now, now, "selected-key", string(snapshot), up.URL, "provider-video")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = st.DB.Exec(`DELETE FROM channels WHERE id='channel'`); err != nil {
		t.Fatal(err)
	}
	w := New(config.Load(), st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	w.pollVideos(context.Background())
	var status, result, taskError string
	if err = st.DB.QueryRow(`SELECT status,result_json,error FROM video_tasks WHERE id='task'`).Scan(&status, &result, &taskError); err != nil {
		t.Fatal(err)
	}
	if !called || status != "succeeded" || taskError != "" || !strings.Contains(result, "result.mp4") {
		t.Fatal(called, status, result, taskError)
	}
}
