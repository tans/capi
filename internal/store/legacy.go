package store

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// migrateLegacy upgrades the Bun database before ordinary Go migrations run.
// A SQLite snapshot and the archived tables retain all legacy configuration,
// including features which do not yet have a Go equivalent.
func (s *Store) migrateLegacy(ctx context.Context, path string) error {
	rows, err := s.DB.QueryContext(ctx, `PRAGMA table_info(users)`)
	if err != nil {
		return err
	}
	legacy := false
	for rows.Next() {
		var cid, notNull, primary int
		var name, typ string
		var defaultValue any
		if err := rows.Scan(&cid, &name, &typ, &notNull, &defaultValue, &primary); err != nil {
			rows.Close()
			return err
		}
		if name == "id" && strings.EqualFold(typ, "INTEGER") {
			legacy = true
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil || !legacy {
		return err
	}

	backupDir := filepath.Join(filepath.Dir(path), "backups", "legacy-"+time.Now().UTC().Format("20060102T150405.000000000Z"))
	if err := os.MkdirAll(backupDir, 0700); err != nil {
		return err
	}
	backup := filepath.Join(backupDir, "capi.sqlite")
	if _, err := s.DB.ExecContext(ctx, "VACUUM INTO '"+strings.ReplaceAll(backup, "'", "''")+"'"); err != nil {
		return fmt.Errorf("back up legacy database: %w", err)
	}
	if err := os.Chmod(backup, 0600); err != nil {
		return err
	}

	rows, err = s.DB.QueryContext(ctx, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		return err
	}
	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		tables = append(tables, name)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	quote := func(name string) string { return `"` + strings.ReplaceAll(name, `"`, `""`) + `"` }
	for _, table := range tables {
		if strings.HasPrefix(table, "legacy_") {
			return fmt.Errorf("legacy archive already exists; restore or inspect %s before retrying", backup)
		}
		if _, err := tx.ExecContext(ctx, "ALTER TABLE "+quote(table)+" RENAME TO "+quote("legacy_"+table)); err != nil {
			return fmt.Errorf("archive %s: %w", table, err)
		}
	}
	for i, migration := range migrations {
		if i == 0 {
			if _, err := tx.ExecContext(ctx, `DROP INDEX IF EXISTS usage_workspace_created_idx`); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(ctx, migration); err != nil {
			return fmt.Errorf("create Go schema: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)`, i+1, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
			return err
		}
	}
	for _, step := range legacyCopies {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`, "legacy_"+step.table).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			continue
		}
		if _, err := tx.ExecContext(ctx, step.sql); err != nil {
			return fmt.Errorf("import legacy %s (backup: %s): %w", step.table, backup, err)
		}
	}
	return tx.Commit()
}

// Legacy quota uses 500,000 units per USD; Go uses 1,000,000 micros.
// IDs remain the same opaque strings, preserving references and API keys.
var legacyCopies = []struct{ table, sql string }{
	{"users", `INSERT INTO users SELECT CAST(id AS TEXT),email,name,password_hash,role,strftime('%Y-%m-%dT%H:%M:%fZ',created_at/1000.0,'unixepoch') FROM legacy_users`},
	{"workspaces", `INSERT INTO workspaces SELECT CAST(id AS TEXT),name,kind,strftime('%Y-%m-%dT%H:%M:%fZ',created_at/1000.0,'unixepoch') FROM legacy_workspaces`},
	{"workspace_members", `INSERT INTO workspace_members SELECT CAST(workspace_id AS TEXT),CAST(user_id AS TEXT),role,strftime('%Y-%m-%dT%H:%M:%fZ',created_at/1000.0,'unixepoch') FROM legacy_workspace_members WHERE status='active'`},
	{"wallets", `INSERT INTO wallets SELECT CAST(workspace_id AS TEXT),balance_units*2,currency,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM legacy_wallets`},
	{"sessions", `INSERT INTO sessions SELECT token_hash,CAST(user_id AS TEXT),strftime('%Y-%m-%dT%H:%M:%fZ',expires_at/1000.0,'unixepoch'),strftime('%Y-%m-%dT%H:%M:%fZ',created_at/1000.0,'unixepoch') FROM legacy_sessions`},
	{"api_keys", `INSERT INTO api_keys(id,workspace_id,name,key_hash,key_prefix,secret,scopes,enabled,created_at,last_used_at)
		SELECT CAST(id AS TEXT),CAST(workspace_id AS TEXT),COALESCE(json_extract(config,'$.name'),'Imported'),key_hash,key_prefix,COALESCE(json_extract(config,'$.secret'),''),
		CASE WHEN json_type(config,'$.scopes') IS NULL THEN '*' ELSE COALESCE((SELECT group_concat(value,',') FROM json_each(config,'$.scopes')),'') END,
		CASE WHEN json_extract(config,'$.status')=1 AND (COALESCE(json_extract(config,'$.expiredTime'),-1)<=0 OR json_extract(config,'$.expiredTime')>CAST(strftime('%s','now') AS INTEGER)*1000) THEN 1 ELSE 0 END,
		strftime('%Y-%m-%dT%H:%M:%fZ',created_time/1000.0,'unixepoch'),CASE WHEN accessed_time IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ',accessed_time/1000.0,'unixepoch') END FROM legacy_api_keys`},
	{"channels", `INSERT INTO channels(id,workspace_id,name,protocol,base_url,api_key,models_json,priority,weight,enabled,created_at,updated_at)
		SELECT CAST(id AS TEXT),CASE WHEN owner_type='workspace' THEN CAST(workspace_id AS TEXT) END,
		COALESCE(json_extract(config,'$.name'),'Imported'),CASE json_extract(config,'$.type') WHEN 'anthropic' THEN 'anthropic' WHEN 'gemini' THEN 'gemini' ELSE 'openai' END,
		COALESCE(json_extract(config,'$.baseUrl'),''),COALESCE(json_extract(config,'$.keys[0]'),''),COALESCE(json_extract(config,'$.models'),'[]'),
		COALESCE(json_extract(config,'$.priority'),0),MAX(COALESCE(json_extract(config,'$.weight'),1),1),CASE WHEN json_extract(config,'$.status')=1 THEN 1 ELSE 0 END,
		strftime('%Y-%m-%dT%H:%M:%fZ',created_time/1000.0,'unixepoch'),strftime('%Y-%m-%dT%H:%M:%fZ',created_time/1000.0,'unixepoch') FROM legacy_channels`},
	{"usage_records", `INSERT INTO usage_records(id,workspace_id,api_key_id,channel_id,model,endpoint,input_tokens,output_tokens,cost_micros,latency_ms,status,created_at,requested_model,routed_model,served_model,cache_read_tokens,ttft_ms)
		SELECT request_id,CAST(workspace_id AS TEXT),COALESCE(CAST(key_id AS TEXT),''),COALESCE(CAST(channel_id AS TEXT),''),model,COALESCE(json_extract(record,'$.endpoint'),'/v1/chat/completions'),prompt_tokens,completion_tokens,quota_units*2,
		COALESCE(json_extract(record,'$.durationMs'),0),status_code,strftime('%Y-%m-%dT%H:%M:%fZ',created_at/1000.0,'unixepoch'),
		COALESCE(json_extract(record,'$.requestModel'),model),model,COALESCE(json_extract(record,'$.upstreamModel'),model),cached_tokens,COALESCE(json_extract(record,'$.firstByteMs'),0) FROM legacy_usage_records`},
	{"video_tasks", `INSERT INTO video_tasks(id,workspace_id,api_key_id,channel_id,upstream_id,model,status,result_json,error,next_poll_at,created_at,updated_at)
		SELECT id,CAST(workspace_id AS TEXT),CAST(key_id AS TEXT),CAST(channel_id AS TEXT),upstream_id,model,state,CASE WHEN result_url IS NOT NULL THEN json_object('url',result_url) END,error,
		CASE WHEN next_poll_at IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ',next_poll_at/1000.0,'unixepoch') END,
		strftime('%Y-%m-%dT%H:%M:%fZ',created_at/1000.0,'unixepoch'),strftime('%Y-%m-%dT%H:%M:%fZ',updated_at/1000.0,'unixepoch') FROM legacy_video_tasks`},
	{"files", `INSERT INTO files SELECT * FROM legacy_files`},
}
