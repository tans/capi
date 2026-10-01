package server

import (
	"database/sql"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func (s *Server) consoleFiles(w http.ResponseWriter, r *http.Request) {
	_, role, ok := s.consoleAccess(w, r, r.Method != http.MethodGet)
	if !ok {
		return
	}
	wid := r.PathValue("wid")
	if r.Method == http.MethodDelete {
		if role != "owner" && role != "admin" {
			apiError(w, http.StatusForbidden, "forbidden", "Workspace admin required to delete files.")
			return
		}
		var path string
		err := s.Store.DB.QueryRowContext(r.Context(), `SELECT path FROM files WHERE id=? AND workspace_id=?`, r.PathValue("id"), wid).Scan(&path)
		if err == sql.ErrNoRows {
			apiError(w, http.StatusNotFound, "file_not_found", "File not found.")
			return
		}
		if err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", err.Error())
			return
		}
		result, err := s.Store.DB.ExecContext(r.Context(), `DELETE FROM files WHERE id=? AND workspace_id=?`, r.PathValue("id"), wid)
		if err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", err.Error())
			return
		}
		deleted, err := result.RowsAffected()
		if err != nil || deleted == 0 {
			apiError(w, http.StatusNotFound, "file_not_found", "File not found.")
			return
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			s.Log.Warn("file_delete_storage_failed", "file_id", r.PathValue("id"), "error", err)
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
		return
	}

	page, pageSize := boundedPage(r.URL.Query().Get("page"), 1, 1, 1_000_000), boundedPage(r.URL.Query().Get("pageSize"), 30, 1, 100)
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	category := r.URL.Query().Get("category")
	if category != "image" && category != "video" && category != "audio" && category != "documents" {
		category = "all"
	}
	pattern := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(search) + "%"
	now := time.Now().UTC().Format(time.RFC3339Nano)
	var total int
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM files WHERE workspace_id=? AND (expires_at IS NULL OR expires_at>?) AND (?='' OR filename LIKE ? ESCAPE '\' OR id LIKE ? ESCAPE '\') AND (?='all' OR (?='image' AND content_type LIKE 'image/%') OR (?='video' AND content_type LIKE 'video/%') OR (?='audio' AND content_type LIKE 'audio/%') OR (?='documents' AND content_type NOT LIKE 'image/%' AND content_type NOT LIKE 'video/%' AND content_type NOT LIKE 'audio/%'))`, wid, now, search, pattern, pattern, category, category, category, category, category).Scan(&total); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT id,filename,content_type,bytes,purpose,created_at,expires_at FROM files WHERE workspace_id=? AND (expires_at IS NULL OR expires_at>?) AND (?='' OR filename LIKE ? ESCAPE '\' OR id LIKE ? ESCAPE '\') AND (?='all' OR (?='image' AND content_type LIKE 'image/%') OR (?='video' AND content_type LIKE 'video/%') OR (?='audio' AND content_type LIKE 'audio/%') OR (?='documents' AND content_type NOT LIKE 'image/%' AND content_type NOT LIKE 'video/%' AND content_type NOT LIKE 'audio/%')) ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, wid, now, search, pattern, pattern, category, category, category, category, category, pageSize, (page-1)*pageSize)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	defer rows.Close()
	data := make([]map[string]any, 0)
	for rows.Next() {
		var id, filename, contentType, purpose, created string
		var size int64
		var expires sql.NullString
		if err := rows.Scan(&id, &filename, &contentType, &size, &purpose, &created, &expires); err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", err.Error())
			return
		}
		data = append(data, map[string]any{"id": id, "filename": filename, "content_type": contentType, "bytes": size, "purpose": purpose, "created_at": created, "expires_at": scanNullString(expires)})
	}
	if err := rows.Err(); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data, "total": total, "page": page, "pageSize": pageSize, "category": category, "search": search})
}

func (s *Server) consoleFileContent(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := s.consoleAccess(w, r, false); !ok {
		return
	}
	var filename, contentType, path string
	err := s.Store.DB.QueryRowContext(r.Context(), `SELECT filename,content_type,path FROM files WHERE id=? AND workspace_id=? AND (expires_at IS NULL OR expires_at>?)`, r.PathValue("id"), r.PathValue("wid"), time.Now().UTC().Format(time.RFC3339Nano)).Scan(&filename, &contentType, &path)
	if err == sql.ErrNoRows {
		apiError(w, http.StatusNotFound, "file_not_found", "File not found.")
		return
	}
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	filename = filepath.Base(strings.ReplaceAll(filename, "\\", "/"))
	if disposition := mime.FormatMediaType("attachment", map[string]string{"filename": filename}); disposition != "" {
		w.Header().Set("Content-Disposition", disposition)
	}
	w.Header().Set("Content-Type", contentType)
	http.ServeFile(w, r, path)
}

func boundedPage(value string, fallback, minimum, maximum int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	if parsed < minimum {
		return minimum
	}
	if parsed > maximum {
		return maximum
	}
	return parsed
}
