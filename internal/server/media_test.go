package server

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestArchiveImageResponsePersistsGeneratedFile(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "capi.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := st.DB.Exec(`INSERT INTO workspaces(id,name,created_at) VALUES('ws','Workspace',?)`, now); err != nil {
		t.Fatal(err)
	}
	cfg := config.Load()
	cfg.DataDir, cfg.FilesDir = dir, filepath.Join(dir, "files")
	s := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	input := []byte("fake png bytes")
	body, _ := json.Marshal(map[string]any{"data": []any{
		map[string]any{"b64_json": base64.StdEncoding.EncodeToString(input), "content_type": "image/png"},
		map[string]any{"b64_json": "%%%"},
	}})
	result := s.archiveImageResponse(body, APIKey{WorkspaceID: "ws"})
	var payload map[string]any
	if err := json.Unmarshal(result, &payload); err != nil {
		t.Fatal(err)
	}
	items := payload["data"].([]any)
	archived := items[0].(map[string]any)
	id := archived["capi_file_id"].(string)
	if archived["archive_status"] != "archived" || id == "" {
		t.Fatalf("archive result: %#v", archived)
	}
	invalid := items[1].(map[string]any)
	if invalid["archive_status"] != "unavailable" {
		t.Fatalf("invalid result: %#v", invalid)
	}
	var path, contentType, purpose, expires string
	var size int64
	if err := st.DB.QueryRow(`SELECT path,content_type,purpose,bytes,expires_at FROM files WHERE id=?`, id).Scan(&path, &contentType, &purpose, &size, &expires); err != nil {
		t.Fatal(err)
	}
	if contentType != "image/png" || purpose != "generated_image" || size != int64(len(input)) {
		t.Fatalf("metadata: %s %s %d", contentType, purpose, size)
	}
	if got, err := os.ReadFile(path); err != nil || string(got) != string(input) {
		t.Fatalf("stored bytes: %q %v", got, err)
	}
	deadline, err := time.Parse(time.RFC3339Nano, expires)
	if err != nil || deadline.Before(time.Now().Add(29*24*time.Hour)) {
		t.Fatalf("expiry: %s %v", expires, err)
	}
}
