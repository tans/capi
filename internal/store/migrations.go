package store

var migrations = []string{
	`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`,
	`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'personal',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workspace_members (workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'owner',created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,user_id),FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS wallets (workspace_id TEXT PRIMARY KEY,balance_micros INTEGER NOT NULL DEFAULT 0,currency TEXT NOT NULL DEFAULT 'USD',updated_at TEXT NOT NULL,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,key_hash TEXT NOT NULL UNIQUE,key_prefix TEXT NOT NULL,secret TEXT NOT NULL,scopes TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,last_used_at TEXT,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY,workspace_id TEXT,name TEXT NOT NULL,protocol TEXT NOT NULL DEFAULT 'openai',base_url TEXT NOT NULL,api_key TEXT NOT NULL,models_json TEXT NOT NULL DEFAULT '[]',priority INTEGER NOT NULL DEFAULT 0,weight INTEGER NOT NULL DEFAULT 1,enabled INTEGER NOT NULL DEFAULT 1,price_input_micros_per_million INTEGER NOT NULL DEFAULT 0,price_output_micros_per_million INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS usage_records (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,api_key_id TEXT NOT NULL,channel_id TEXT NOT NULL,model TEXT NOT NULL,endpoint TEXT NOT NULL,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,cost_micros INTEGER NOT NULL DEFAULT 0,latency_ms INTEGER NOT NULL DEFAULT 0,status INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS usage_workspace_created_idx ON usage_records(workspace_id,created_at DESC);
CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,filename TEXT NOT NULL,content_type TEXT NOT NULL,bytes INTEGER NOT NULL,path TEXT NOT NULL,purpose TEXT NOT NULL DEFAULT 'assistants',created_at TEXT NOT NULL,expires_at TEXT,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS video_tasks (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,api_key_id TEXT NOT NULL,channel_id TEXT NOT NULL,upstream_id TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,result_json TEXT,error TEXT,next_poll_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`,
	`ALTER TABLE usage_records ADD COLUMN requested_model TEXT NOT NULL DEFAULT '';
ALTER TABLE usage_records ADD COLUMN routed_model TEXT NOT NULL DEFAULT '';
ALTER TABLE usage_records ADD COLUMN served_model TEXT NOT NULL DEFAULT '';
ALTER TABLE usage_records ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_records ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_records ADD COLUMN reasoning_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_records ADD COLUMN ttft_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_records ADD COLUMN affinity_key TEXT NOT NULL DEFAULT '';`,
	`ALTER TABLE workspaces ADD COLUMN allow_platform_channels INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workspaces ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE api_keys ADD COLUMN group_name TEXT NOT NULL DEFAULT '';
ALTER TABLE api_keys ADD COLUMN budget_limit_micros INTEGER;
ALTER TABLE api_keys ADD COLUMN owner_user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE api_keys ADD COLUMN expires_at TEXT;
ALTER TABLE api_keys ADD COLUMN model_limits_json TEXT NOT NULL DEFAULT '[]';
CREATE TABLE model_groups(name TEXT PRIMARY KEY,display_name TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,models_json TEXT NOT NULL DEFAULT '[]');
INSERT INTO model_groups(name,display_name) VALUES('default','Default');`,
	`ALTER TABLE channels ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE channels ADD COLUMN last_error TEXT NOT NULL DEFAULT '';
ALTER TABLE channels ADD COLUMN auto_disabled_at TEXT;`,
	`ALTER TABLE video_tasks ADD COLUMN upstream_key TEXT NOT NULL DEFAULT '';
ALTER TABLE video_tasks ADD COLUMN channel_snapshot TEXT NOT NULL DEFAULT '{}';`,
	`ALTER TABLE video_tasks ADD COLUMN upstream_base TEXT NOT NULL DEFAULT '';
ALTER TABLE video_tasks ADD COLUMN upstream_model TEXT NOT NULL DEFAULT '';`,
	`ALTER TABLE wallets ADD COLUMN reserved_micros INTEGER NOT NULL DEFAULT 0;
CREATE TABLE billing_reservations(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,api_key_id TEXT NOT NULL,amount_micros INTEGER NOT NULL CHECK(amount_micros>=0),state TEXT NOT NULL DEFAULT 'held',lease_expires_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX billing_reservations_key_state ON billing_reservations(api_key_id,state);
CREATE TABLE wallet_entries(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,kind TEXT NOT NULL,delta_micros INTEGER NOT NULL,reason TEXT NOT NULL,reference_id TEXT UNIQUE,balance_micros INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX wallet_entries_workspace_created ON wallet_entries(workspace_id,created_at DESC);
INSERT INTO wallet_entries SELECT 'opening_'||workspace_id,workspace_id,'opening',balance_micros,'Opening balance','opening_'||workspace_id,balance_micros,updated_at FROM wallets;
CREATE TABLE redeem_codes(id TEXT PRIMARY KEY,code_hash TEXT NOT NULL UNIQUE,secret_code TEXT NOT NULL DEFAULT '',name TEXT NOT NULL,amount_micros INTEGER NOT NULL CHECK(amount_micros>0),enabled INTEGER NOT NULL DEFAULT 1,expires_at TEXT,created_at TEXT NOT NULL,redeemed_at TEXT,redeemed_workspace_id TEXT,redeemed_user_id TEXT);
CREATE TABLE legacy_restore_state(feature TEXT PRIMARY KEY);`,
	`CREATE TABLE workspace_invites (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,invited_by TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(invited_by) REFERENCES users(id) ON DELETE CASCADE,UNIQUE(workspace_id,email));
CREATE INDEX workspace_invites_expiry ON workspace_invites(workspace_id,expires_at);`,
	`ALTER TABLE model_groups ADD COLUMN ratio REAL NOT NULL DEFAULT 1;
ALTER TABLE model_groups ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE model_groups ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
UPDATE model_groups SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE created_at='';`,
	`CREATE TABLE app_settings (id INTEGER PRIMARY KEY CHECK(id=1), config_json TEXT NOT NULL DEFAULT '{}');
INSERT INTO app_settings(id,config_json) VALUES(1,'{}');`,
	`CREATE TABLE password_reset_codes (
	user_id TEXT PRIMARY KEY,
	code_hash TEXT NOT NULL,
	expires_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	attempts INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE password_reset_limits (
	bucket_hash TEXT PRIMARY KEY,
	window_started_at INTEGER NOT NULL,
	request_count INTEGER NOT NULL
);
CREATE INDEX password_reset_limits_window ON password_reset_limits(window_started_at);`,
	`CREATE TABLE user_settings (
	user_id TEXT PRIMARY KEY,
	settings_json TEXT NOT NULL DEFAULT '{}',
	updated_at TEXT NOT NULL,
	FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);`,
	`CREATE TABLE video_idempotency (
	api_key_id TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	request_hash TEXT NOT NULL,
	task_id TEXT,
	created_at TEXT NOT NULL,
	PRIMARY KEY(api_key_id,idempotency_key),
	FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);`,
}
