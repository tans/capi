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
}
