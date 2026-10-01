package server

import (
	"net/http"
	"strings"
	"time"
)

type productAnnouncement struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Body        string `json:"body"`
	PublishedAt string `json:"publishedAt"`
	PublishedBy string `json:"publishedBy"`
	Recipients  int    `json:"recipients"`
	Delivered   int    `json:"delivered"`
	Pending     int    `json:"pending"`
	Suppressed  int    `json:"suppressed"`
}

func (s *Server) consoleAdminAnnouncements(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && !s.sameOrigin(r) {
		apiError(w, http.StatusForbidden, "bad_origin", "Origin is not allowed.")
		return
	}
	session, err := s.requireAdmin(r)
	if err != nil {
		apiError(w, http.StatusForbidden, "forbidden", "Admin required.")
		return
	}
	switch r.Method {
	case http.MethodGet:
		rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT a.id,a.title,a.body,a.published_at,u.name,
			COUNT(e.id),COALESCE(SUM(CASE WHEN e.status='delivered' THEN 1 ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN e.status='pending' THEN 1 ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN e.status='suppressed' THEN 1 ELSE 0 END),0)
			FROM product_announcements a JOIN users u ON u.id=a.published_by
			LEFT JOIN product_notification_events e ON e.announcement_id=a.id
			GROUP BY a.id ORDER BY a.published_at DESC LIMIT 20`)
		if err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", "Unable to load product announcements.")
			return
		}
		defer rows.Close()
		announcements := make([]productAnnouncement, 0)
		for rows.Next() {
			var item productAnnouncement
			if err := rows.Scan(&item.ID, &item.Title, &item.Body, &item.PublishedAt, &item.PublishedBy, &item.Recipients, &item.Delivered, &item.Pending, &item.Suppressed); err != nil {
				apiError(w, http.StatusInternalServerError, "database_error", "Unable to read product announcements.")
				return
			}
			announcements = append(announcements, item)
		}
		if err := rows.Err(); err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", "Unable to read product announcements.")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"announcements": announcements})
	case http.MethodPost:
		var in struct {
			Title string `json:"title"`
			Body  string `json:"body"`
		}
		if readJSON(r, &in) != nil {
			apiError(w, http.StatusBadRequest, "invalid_announcement", "Provide a valid announcement title and body.")
			return
		}
		in.Title = strings.TrimSpace(in.Title)
		in.Body = strings.TrimSpace(in.Body)
		if in.Title == "" || len([]rune(in.Title)) > 120 || hasHeaderBreak(in.Title) || in.Body == "" || len([]rune(in.Body)) > 10000 {
			apiError(w, http.StatusBadRequest, "invalid_announcement", "Title is required (up to 120 characters) and body is required (up to 10000 characters).")
			return
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		tx, err := s.Store.DB.BeginTx(r.Context(), nil)
		if err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", "Unable to publish announcement.")
			return
		}
		var id string
		if err = tx.QueryRowContext(r.Context(), `SELECT lower(hex(randomblob(16)))`).Scan(&id); err == nil {
			_, err = tx.ExecContext(r.Context(), `INSERT INTO product_announcements(id,title,body,published_by,published_at) VALUES(?,?,?,?,?)`, id, in.Title, in.Body, session.User.ID, now)
		}
		if err == nil {
			_, err = tx.ExecContext(r.Context(), `INSERT OR IGNORE INTO product_notification_events(id,announcement_id,user_id,status,next_attempt_at,created_at)
				SELECT lower(hex(randomblob(16))),?,u.id,'pending',?,?
				FROM users u JOIN user_settings us ON us.user_id=u.id
				WHERE json_valid(us.settings_json) AND json_extract(us.settings_json,'$.notifications.product')=1`, id, now, now)
		}
		if err != nil {
			_ = tx.Rollback()
			apiError(w, http.StatusInternalServerError, "database_error", "Unable to publish announcement.")
			return
		}
		if err := tx.Commit(); err != nil {
			apiError(w, http.StatusInternalServerError, "database_error", "Unable to publish announcement.")
			return
		}
		var recipients int
		_ = s.Store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM product_notification_events WHERE announcement_id=?`, id).Scan(&recipients)
		writeJSON(w, http.StatusCreated, productAnnouncement{ID: id, Title: in.Title, Body: in.Body, PublishedAt: now, PublishedBy: session.User.Name, Recipients: recipients, Pending: recipients})
	default:
		w.Header().Set("Allow", "GET, POST")
		apiError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Unsupported announcement operation.")
	}
}
