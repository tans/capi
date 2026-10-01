package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestConsoleFilesWorkspacePermissionsSearchDownloadAndDelete(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "capi.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir, cfg.FilesDir = dir, filepath.Join(dir, "files")
	s := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	register := func(email string) (*http.Cookie, string) {
		t.Helper()
		body, _ := json.Marshal(map[string]string{"email": email, "password": "test-password-123", "name": "Files User"})
		res, err := http.Post(ts.URL+"/api/auth/register", "application/json", bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var out struct {
			Workspace string `json:"workspace_id"`
		}
		if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("register: %d", res.StatusCode)
		}
		return res.Cookies()[0], out.Workspace
	}
	owner, workspaceID := register("files-owner@example.test")
	other, _ := register("files-other@example.test")
	memberRequest := httptest.NewRequest(http.MethodGet, "/", nil)
	memberRequest.AddCookie(other)
	memberSession, err := s.requireSession(memberRequest)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?)`, workspaceID, memberSession.User.ID, "member", time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}

	fileID := "file_photo"
	path := filepath.Join(cfg.FilesDir, fileID)
	if err := os.MkdirAll(cfg.FilesDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("private image bytes"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO files(id,workspace_id,filename,content_type,bytes,path,purpose,created_at) VALUES(?,?,?,?,?,?,?,?)`, fileID, workspaceID, "team photo.png", "image/png", int64(19), path, "assistants", time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}

	call := func(method, route string, cookie *http.Cookie) *http.Response {
		t.Helper()
		req, err := http.NewRequest(method, ts.URL+route, nil)
		if err != nil {
			t.Fatal(err)
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	base := "/api/workspaces/" + workspaceID + "/files"
	if res := call(http.MethodGet, base, nil); res.StatusCode != http.StatusUnauthorized {
		res.Body.Close()
		t.Fatalf("anonymous read status %d", res.StatusCode)
	} else {
		res.Body.Close()
	}
	if res := call(http.MethodGet, base, other); res.StatusCode != http.StatusOK {
		res.Body.Close()
		t.Fatalf("member read status %d", res.StatusCode)
	} else {
		res.Body.Close()
	}
	if res := call(http.MethodGet, base+"?search=photo&category=image", owner); res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		t.Fatalf("owner search status %d: %s", res.StatusCode, body)
	} else {
		var result struct {
			Total int              `json:"total"`
			Data  []map[string]any `json:"data"`
		}
		if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if result.Total != 1 || len(result.Data) != 1 || result.Data[0]["id"] != fileID {
			t.Fatalf("unexpected filtered files: %#v", result)
		}
	}
	if res := call(http.MethodGet, base+"/"+fileID+"/content", other); res.StatusCode != http.StatusOK {
		res.Body.Close()
		t.Fatalf("member download status %d", res.StatusCode)
	} else {
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if string(body) != "private image bytes" || res.Header.Get("Content-Type") != "image/png" {
			t.Fatalf("unexpected downloaded content %q, %q", body, res.Header.Get("Content-Type"))
		}
	}
	if res := call(http.MethodDelete, base+"/"+fileID, other); res.StatusCode != http.StatusForbidden {
		res.Body.Close()
		t.Fatalf("member delete status %d", res.StatusCode)
	} else {
		res.Body.Close()
	}
	if res := call(http.MethodDelete, base+"/"+fileID, owner); res.StatusCode != http.StatusOK {
		res.Body.Close()
		t.Fatalf("owner delete status %d", res.StatusCode)
	} else {
		res.Body.Close()
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("stored file remains after delete: %v", err)
	}
}
