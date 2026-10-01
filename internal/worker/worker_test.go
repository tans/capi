package worker

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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

func TestArchiveVideoStoresWorkspaceFileWithExpiry(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "test.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := st.DB.Exec(`INSERT INTO workspaces(id,name,created_at) VALUES('ws','Workspace',?)`, now); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO video_tasks(id,workspace_id,api_key_id,channel_id,upstream_id,model,status,next_poll_at,created_at,updated_at) VALUES('task','ws','key','channel','job','model','queued',?,?,?)`, now, now, now); err != nil {
		t.Fatal(err)
	}
	cfg := config.Load()
	cfg.FilesDir = filepath.Join(dir, "files")
	w := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	res := &http.Response{Header: http.Header{"Content-Type": []string{"video/mp4"}}, Body: io.NopCloser(strings.NewReader("video bytes"))}
	id, err := w.archiveVideo(context.Background(), "task", res)
	if err != nil {
		t.Fatal(err)
	}
	var wid, purpose, path, expiry string
	var size int64
	if err := st.DB.QueryRow(`SELECT workspace_id,purpose,path,bytes,expires_at FROM files WHERE id=?`, id).Scan(&wid, &purpose, &path, &size, &expiry); err != nil {
		t.Fatal(err)
	}
	if wid != "ws" || purpose != "generated_video" || size != int64(len("video bytes")) {
		t.Fatalf("invalid archive: %s %s %d", wid, purpose, size)
	}
	if got, err := os.ReadFile(path); err != nil || string(got) != "video bytes" {
		t.Fatalf("archive bytes: %q %v", got, err)
	}
	deadline, err := time.Parse(time.RFC3339Nano, expiry)
	if err != nil || deadline.Before(time.Now().Add(29*24*time.Hour)) || deadline.After(time.Now().Add(31*24*time.Hour)) {
		t.Fatalf("expiry: %s %v", expiry, err)
	}
	if _, _, err := publicMediaAddress(context.Background(), "http://127.0.0.1/video.mp4"); err == nil {
		t.Fatal("accepted insecure media URL")
	}
	if _, _, err := publicMediaAddress(context.Background(), "https://127.0.0.1/video.mp4"); err == nil {
		t.Fatal("accepted private media URL")
	}
	if publicIP(net.ParseIP("100.64.0.1")) || publicIP(net.ParseIP("192.168.1.2")) || !publicIP(net.ParseIP("8.8.8.8")) {
		t.Fatal("public IP classification is incorrect")
	}
	if err := st.DB.QueryRow(`UPDATE files SET expires_at=? WHERE id=? RETURNING expires_at`, time.Now().Add(-time.Minute).UTC().Format(time.RFC3339Nano), id).Scan(&expiry); err != nil {
		t.Fatal(err)
	}
	w.cleanup(context.Background())
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expired file remains: %v", err)
	}
}
