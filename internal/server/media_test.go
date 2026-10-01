package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net"
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

func TestPublicImageIPRejectsPrivateAndReservedRanges(t *testing.T) {
	for _, value := range []string{"10.0.0.1", "100.64.0.1", "192.0.2.1", "198.18.0.1", "203.0.113.1", "2001:db8::1", "fc00::1", "fe80::1"} {
		if ip := net.ParseIP(value); publicImageIP(ip) {
			t.Errorf("publicImageIP(%q) = true, want false", value)
		}
	}
	for _, value := range []string{"8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"} {
		if ip := net.ParseIP(value); !publicImageIP(ip) {
			t.Errorf("publicImageIP(%q) = false, want true", value)
		}
	}
}

func TestPublicImageAddressRequiresHTTPSAndDefaultPort(t *testing.T) {
	for _, value := range []string{"http://8.8.8.8/image.png", "https://user:pass@example.com/image.png", "https://8.8.8.8:8443/image.png", "https://127.0.0.1/image.png"} {
		if _, _, err := publicImageAddress(context.Background(), value); err == nil {
			t.Errorf("publicImageAddress(%q) unexpectedly succeeded", value)
		}
	}
}

func TestArchiveImageResponseDoesNotFetchPrivateRemoteImage(t *testing.T) {
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
	body, _ := json.Marshal(map[string]any{"data": []any{map[string]any{"url": "https://127.0.0.1/secret.png"}}})
	result := s.archiveImageResponseContext(context.Background(), body, APIKey{WorkspaceID: "ws"})
	var payload map[string]any
	if err := json.Unmarshal(result, &payload); err != nil {
		t.Fatal(err)
	}
	image := payload["data"].([]any)[0].(map[string]any)
	if image["archive_status"] != "unavailable" {
		t.Fatalf("private remote image status = %#v, want unavailable", image)
	}
	var count int
	if err := st.DB.QueryRow(`SELECT COUNT(*) FROM files`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("private remote image created %d files: %v", count, err)
	}
}
