package server

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
)

const inviteLifetime = 7 * 24 * time.Hour

func (s *Server) consoleMembers(w http.ResponseWriter, r *http.Request) {
	sess, role, ok := s.consoleAccess(w, r, r.Method != http.MethodGet)
	if !ok {
		return
	}
	wid, targetID := r.PathValue("wid"), r.PathValue("id")
	if r.Method == http.MethodGet {
		rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT u.id,u.name,u.email,m.role FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.name`, wid)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		members := make([]map[string]any, 0)
		for rows.Next() {
			var id, name, email, memberRole string
			if err := rows.Scan(&id, &name, &email, &memberRole); err != nil {
				rows.Close()
				apiError(w, 500, "database_error", err.Error())
				return
			}
			members = append(members, map[string]any{"id": id, "name": name, "email": email, "role": memberRole, "status": "active"})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			apiError(w, 500, "database_error", err.Error())
			return
		}
		rows.Close()
		invites := make([]map[string]any, 0)
		if role == "owner" || role == "admin" {
			inviteRows, err := s.Store.DB.QueryContext(r.Context(), `SELECT id,email,role,expires_at FROM workspace_invites WHERE workspace_id=? AND expires_at>? ORDER BY created_at DESC`, wid, time.Now().UTC().Format(time.RFC3339Nano))
			if err != nil {
				apiError(w, 500, "database_error", err.Error())
				return
			}
			for inviteRows.Next() {
				var id, email, inviteRole, expiresAt string
				if err := inviteRows.Scan(&id, &email, &inviteRole, &expiresAt); err != nil {
					inviteRows.Close()
					apiError(w, 500, "database_error", err.Error())
					return
				}
				parsed, err := time.Parse(time.RFC3339Nano, expiresAt)
				if err == nil {
					invites = append(invites, map[string]any{"id": id, "email": email, "role": inviteRole, "expiresAt": parsed.UnixMilli()})
				}
			}
			if err := inviteRows.Err(); err != nil {
				inviteRows.Close()
				apiError(w, 500, "database_error", err.Error())
				return
			}
			inviteRows.Close()
		}
		writeJSON(w, 200, map[string]any{"data": members, "invites": invites})
		return
	}
	if r.Method == http.MethodPost {
		var in struct {
			Email string `json:"email"`
			Role  string `json:"role"`
		}
		if readJSON(r, &in) != nil {
			apiError(w, 400, "invalid_invite", "Valid email and role are required.")
			return
		}
		in.Email = strings.ToLower(strings.TrimSpace(in.Email))
		if !strings.Contains(in.Email, "@") || len(in.Email) > 254 || (in.Role != "member" && in.Role != "admin") {
			apiError(w, 400, "invalid_invite", "Choose a valid email and member or admin role.")
			return
		}
		var exists int
		if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND u.email=?`, wid, in.Email).Scan(&exists); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		if exists > 0 {
			apiError(w, 409, "already_member", "This account already belongs to the workspace.")
			return
		}
		token, id := auth.RandomToken("capi_invite_"), auth.RandomID("inv_")
		now := time.Now().UTC()
		tx, err := s.Store.DB.BeginTx(r.Context(), nil)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		defer tx.Rollback()
		if _, err = tx.ExecContext(r.Context(), `DELETE FROM workspace_invites WHERE workspace_id=? AND email=?`, wid, in.Email); err == nil {
			_, err = tx.ExecContext(r.Context(), `INSERT INTO workspace_invites(id,workspace_id,email,role,token_hash,invited_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)`, id, wid, in.Email, in.Role, auth.HashToken(token), sess.User.ID, now.Format(time.RFC3339Nano), now.Add(inviteLifetime).Format(time.RFC3339Nano))
		}
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		if err = tx.Commit(); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		writeJSON(w, 201, map[string]any{"id": id, "token": token, "expiresAt": now.Add(inviteLifetime).UnixMilli()})
		return
	}
	if r.Method == http.MethodDelete {
		if role != "owner" && role != "admin" {
			apiError(w, 403, "forbidden", "Workspace admin required.")
			return
		}
		result, err := s.Store.DB.ExecContext(r.Context(), `DELETE FROM workspace_invites WHERE id=? AND workspace_id=?`, targetID, wid)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			apiError(w, 404, "not_found", "Invitation not found.")
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	if r.Method != http.MethodPatch {
		apiError(w, 405, "method_not_allowed", "Unsupported member operation.")
		return
	}
	if role != "owner" && role != "admin" {
		apiError(w, 403, "forbidden", "Workspace admin required.")
		return
	}
	var in struct {
		Role   string `json:"role"`
		Action string `json:"action"`
	}
	if readJSON(r, &in) != nil {
		apiError(w, 400, "invalid_member", "Invalid member operation.")
		return
	}
	var targetRole string
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, wid, targetID).Scan(&targetRole); err != nil {
		apiError(w, 404, "not_found", "Member not found.")
		return
	}
	if targetRole == "owner" {
		apiError(w, 409, "owner_transfer_required", "Transfer ownership before changing or removing the owner.")
		return
	}
	if role == "admin" && targetRole != "member" {
		apiError(w, 403, "forbidden", "Only the workspace owner can manage administrators.")
		return
	}
	if in.Action == "transfer_owner" {
		if role != "owner" {
			apiError(w, 403, "forbidden", "Only the workspace owner can transfer ownership.")
			return
		}
		tx, err := s.Store.DB.BeginTx(r.Context(), nil)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		defer tx.Rollback()
		if _, err = tx.ExecContext(r.Context(), `UPDATE workspace_members SET role='admin' WHERE workspace_id=? AND user_id=? AND role='owner'`, wid, sess.User.ID); err == nil {
			var n int64
			var result sql.Result
			result, err = tx.ExecContext(r.Context(), `UPDATE workspace_members SET role='owner' WHERE workspace_id=? AND user_id=?`, wid, targetID)
			if err == nil {
				n, err = result.RowsAffected()
				if err == nil && n != 1 {
					err = sql.ErrNoRows
				}
			}
		}
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		if err = tx.Commit(); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	if in.Role != "member" && in.Role != "admin" {
		apiError(w, 400, "invalid_role", "Choose member or admin.")
		return
	}
	if _, err := s.Store.DB.ExecContext(r.Context(), `UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?`, in.Role, wid, targetID); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) consoleMemberDelete(w http.ResponseWriter, r *http.Request) {
	_, role, ok := s.consoleAccess(w, r, true)
	if !ok {
		return
	}
	if role != "owner" && role != "admin" {
		apiError(w, 403, "forbidden", "Workspace admin required.")
		return
	}
	wid, targetID := r.PathValue("wid"), r.PathValue("id")
	var targetRole string
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`, wid, targetID).Scan(&targetRole); err != nil {
		apiError(w, 404, "not_found", "Member not found.")
		return
	}
	if targetRole == "owner" || (role == "admin" && targetRole != "member") {
		apiError(w, 403, "forbidden", "This member cannot be removed by your role.")
		return
	}
	tx, err := s.Store.DB.BeginTx(r.Context(), nil)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `UPDATE api_keys SET enabled=0 WHERE workspace_id=? AND owner_user_id=?`, wid, targetID); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	result, err := tx.ExecContext(r.Context(), `DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?`, wid, targetID)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		apiError(w, 404, "not_found", "Member not found.")
		return
	}
	if err := tx.Commit(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) acceptWorkspaceInvite(w http.ResponseWriter, r *http.Request) {
	var id, wid, email, inviteRole, expires string
	err := s.Store.DB.QueryRowContext(r.Context(), `SELECT i.id,i.workspace_id,i.email,i.role,i.expires_at FROM workspace_invites i WHERE i.token_hash=?`, auth.HashToken(r.PathValue("token"))).Scan(&id, &wid, &email, &inviteRole, &expires)
	if err == sql.ErrNoRows {
		apiError(w, 404, "invite_not_found", "Invitation not found or expired.")
		return
	}
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	expiresAt, err := time.Parse(time.RFC3339Nano, expires)
	if err != nil || !expiresAt.After(time.Now()) {
		apiError(w, 410, "invite_expired", "This invitation has expired.")
		return
	}
	var workspaceName string
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT name FROM workspaces WHERE id=?`, wid).Scan(&workspaceName); err != nil {
		apiError(w, 404, "invite_not_found", "Workspace no longer exists.")
		return
	}
	if r.Method == http.MethodGet {
		writeJSON(w, 200, map[string]any{"email": email, "role": inviteRole, "workspace": workspaceName, "expiresAt": expiresAt.UnixMilli()})
		return
	}
	if r.Method != http.MethodPost {
		apiError(w, 405, "method_not_allowed", "Unsupported invitation operation.")
		return
	}
	if !s.sameOrigin(r) {
		apiError(w, 403, "bad_origin", "Origin is not allowed.")
		return
	}
	sess, err := s.requireSession(r)
	if err != nil {
		apiError(w, 401, "unauthorized", "Sign in with the invited email to continue.")
		return
	}
	if !strings.EqualFold(sess.User.Email, email) {
		apiError(w, 403, "invite_email_mismatch", "Sign in with the email address this invitation was sent to.")
		return
	}
	tx, err := s.Store.DB.BeginTx(r.Context(), nil)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer tx.Rollback()
	var currentExpires string
	if err := tx.QueryRowContext(r.Context(), `SELECT expires_at FROM workspace_invites WHERE id=? AND token_hash=?`, id, auth.HashToken(r.PathValue("token"))).Scan(&currentExpires); err != nil {
		apiError(w, 404, "invite_not_found", "Invitation no longer exists.")
		return
	}
	if parsed, err := time.Parse(time.RFC3339Nano, currentExpires); err != nil || !parsed.After(time.Now()) {
		apiError(w, 410, "invite_expired", "This invitation has expired.")
		return
	}
	if _, err := tx.ExecContext(r.Context(), `INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,?) ON CONFLICT(workspace_id,user_id) DO NOTHING`, wid, sess.User.ID, inviteRole, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if _, err := tx.ExecContext(r.Context(), `DELETE FROM workspace_invites WHERE id=?`, id); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "workspaceId": wid, "workspace": workspaceName})
}
