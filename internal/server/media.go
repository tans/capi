package server

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
)

const archivedImageLimit = 25 << 20

func (s *Server) archiveImageResponse(body []byte, k APIKey) []byte {
	var payload map[string]any
	if json.Unmarshal(body, &payload) != nil {
		return body
	}
	items, ok := payload["data"].([]any)
	if !ok {
		return body
	}
	for _, item := range items {
		image, ok := item.(map[string]any)
		if !ok {
			continue
		}
		encoded, ok := image["b64_json"].(string)
		if !ok || encoded == "" {
			if _, hasURL := image["url"].(string); hasURL {
				image["archive_status"] = "unavailable"
			}
			continue
		}
		data, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(data) == 0 || len(data) > archivedImageLimit {
			image["archive_status"] = "unavailable"
			continue
		}
		contentType := "image/png"
		ext := ".png"
		if value, ok := image["content_type"].(string); ok {
			switch strings.ToLower(strings.TrimSpace(value)) {
			case "image/jpeg":
				contentType, ext = "image/jpeg", ".jpg"
			case "image/webp":
				contentType, ext = "image/webp", ".webp"
			case "image/gif":
				contentType, ext = "image/gif", ".gif"
			}
		}
		id, err := s.storeGeneratedFile(k.WorkspaceID, "generated-image"+ext, contentType, data)
		if err != nil {
			s.Log.Warn("image_archive_failed", "error", err)
			image["archive_status"] = "unavailable"
			continue
		}
		image["capi_file_id"] = id
		image["capi_url"] = "/v1/files/" + id + "/content"
		image["archive_status"] = "archived"
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return body
	}
	return encoded
}

func (s *Server) storeGeneratedFile(workspaceID, filename, contentType string, data []byte) (string, error) {
	if workspaceID == "" || len(data) == 0 || len(data) > archivedImageLimit {
		return "", errors.New("invalid generated file")
	}
	if err := os.MkdirAll(s.Cfg.FilesDir, 0o700); err != nil {
		return "", err
	}
	id := auth.RandomID("file_")
	path := filepath.Join(s.Cfg.FilesDir, id)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return "", err
	}
	now := time.Now().UTC()
	_, err := s.Store.DB.Exec(`INSERT INTO files(id,workspace_id,filename,content_type,bytes,path,purpose,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)`, id, workspaceID, filename, contentType, len(data), path, "generated_image", now.Format(time.RFC3339Nano), now.Add(30*24*time.Hour).Format(time.RFC3339Nano))
	if err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return id, nil
}
