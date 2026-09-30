package store

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func TestLegacyMigrationPreservesData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "capi.sqlite")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`
CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,name TEXT,password_hash TEXT,role TEXT,created_at INTEGER);
INSERT INTO users VALUES(1,'legacy@example.test','Legacy','old-password-hash','admin',1700000000000);
CREATE TABLE workspaces(id INTEGER PRIMARY KEY,name TEXT,kind TEXT,created_at INTEGER);
INSERT INTO workspaces VALUES(1,'Legacy Workspace','personal',1700000000000);
CREATE TABLE workspace_members(id INTEGER PRIMARY KEY,workspace_id INTEGER,user_id INTEGER,role TEXT,status TEXT,created_at INTEGER);
INSERT INTO workspace_members VALUES(1,1,1,'owner','active',1700000000000);
CREATE TABLE wallets(workspace_id INTEGER PRIMARY KEY,balance_units INTEGER,currency TEXT,reserved_units INTEGER);
INSERT INTO wallets VALUES(1,2500000,'USD',0);
CREATE TABLE wallet_entries(id INTEGER PRIMARY KEY,workspace_id INTEGER,kind TEXT,delta_units INTEGER,idempotency_key TEXT,reason TEXT,created_at INTEGER);
INSERT INTO wallet_entries VALUES(1,1,'opening',3000000,'opening:1','Opening credit',1700000000000),(2,1,'charge',-500000,'settle:old','Old usage',1700000000001);
CREATE TABLE redeem_codes(id INTEGER PRIMARY KEY,code TEXT,amount_quota INTEGER,redeemed_by INTEGER,redeemed_at INTEGER,created_at INTEGER,expires_at INTEGER);
INSERT INTO redeem_codes VALUES(1,'CAPI-old-available',500000,NULL,NULL,1700000000000,NULL),(2,'CAPI-old-used',1000,1,1700000000010,1700000000000,NULL);
CREATE TABLE redeem_code_credits(redeem_code_id INTEGER PRIMARY KEY,workspace_id INTEGER,wallet_entry_id INTEGER);
INSERT INTO redeem_code_credits VALUES(2,1,2);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER,expires_at INTEGER,created_at INTEGER);
INSERT INTO sessions VALUES('old-session-hash',1,4102444800000,1700000000000);
CREATE TABLE channels(id INTEGER PRIMARY KEY,owner_type TEXT,workspace_id INTEGER,config TEXT,created_time INTEGER);
INSERT INTO channels VALUES(1,'platform',NULL,'{"name":"Legacy Provider","type":"openai-compatible","baseUrl":"https://provider.test/v1","keys":["upstream-secret"],"models":["chat-model"],"priority":10,"weight":0,"status":1}',1700000000000);
CREATE TABLE api_keys(id INTEGER PRIMARY KEY,workspace_id INTEGER,key_hash TEXT,key_prefix TEXT,config TEXT,created_time INTEGER,accessed_time INTEGER);
INSERT INTO api_keys VALUES(1,1,'old-key-hash','capi_prefix','{"name":"Legacy Key","status":1,"scopes":["llm.chat","billing.read"],"expiredTime":-1}',1700000000000,NULL);
INSERT INTO api_keys VALUES(2,1,'expired-key-hash','capi_prefix','{"name":"Expired Key","status":1,"scopes":["llm.chat"],"expiredTime":1700000000000}',1700000000000,NULL);
CREATE TABLE usage_records(request_id TEXT,workspace_id INTEGER,key_id INTEGER,channel_id INTEGER,model TEXT,prompt_tokens INTEGER,completion_tokens INTEGER,quota_units INTEGER,status_code INTEGER,created_at INTEGER,record TEXT,cached_tokens INTEGER);
INSERT INTO usage_records VALUES('old-request',1,1,1,'chat-model',10,2,100,200,1700000000000,'{"durationMs":45,"requestModel":"requested","upstreamModel":"served"}',3);
CREATE INDEX usage_workspace_created_idx ON usage_records(workspace_id,created_at);
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT);
INSERT INTO schema_migrations VALUES(1,'previous-go-start'),(2,'previous-go-start'),(3,'previous-go-start');
`)
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	st, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	var userID, role, hash string
	if err := st.DB.QueryRow(`SELECT id,role,password_hash FROM users`).Scan(&userID, &role, &hash); err != nil {
		t.Fatal(err)
	}
	if userID != "1" || role != "admin" || hash != "old-password-hash" {
		t.Fatal("legacy account changed")
	}
	var balance int64
	if err := st.DB.QueryRow(`SELECT balance_micros FROM wallets`).Scan(&balance); err != nil || balance != 5000000 {
		t.Fatalf("balance: %d, %v", balance, err)
	}
	var ledgerTotal int64
	var entries int
	if err := st.DB.QueryRow(`SELECT COUNT(*),SUM(delta_micros) FROM wallet_entries`).Scan(&entries, &ledgerTotal); err != nil || entries != 2 || ledgerTotal != 5000000 {
		t.Fatal("legacy ledger not restored", entries, ledgerTotal, err)
	}
	var after int64
	if err := st.DB.QueryRow(`SELECT balance_micros FROM wallet_entries WHERE id='legacy_entry_2'`).Scan(&after); err != nil || after != 5000000 {
		t.Fatal(after, err)
	}
	var amount int64
	var code, redeemedWorkspace string
	if err := st.DB.QueryRow(`SELECT secret_code,amount_micros FROM redeem_codes WHERE id='1'`).Scan(&code, &amount); err != nil || code != "CAPI-old-available" || amount != 1000000 {
		t.Fatal(code, amount, err)
	}
	if err := st.DB.QueryRow(`SELECT redeemed_workspace_id FROM redeem_codes WHERE id='2'`).Scan(&redeemedWorkspace); err != nil || redeemedWorkspace != "1" {
		t.Fatal(redeemedWorkspace, err)
	}
	var keyHash, scopes string
	var enabled int
	if err := st.DB.QueryRow(`SELECT key_hash,scopes,enabled FROM api_keys WHERE id='1'`).Scan(&keyHash, &scopes, &enabled); err != nil || keyHash != "old-key-hash" || scopes != "llm.chat,billing.read" || enabled != 1 {
		t.Fatalf("key migration: %s %s %d %v", keyHash, scopes, enabled, err)
	}
	if err := st.DB.QueryRow(`SELECT enabled FROM api_keys WHERE id='2'`).Scan(&enabled); err != nil || enabled != 0 {
		t.Fatalf("expired key enabled: %d %v", enabled, err)
	}
	var expiry string
	if err := st.DB.QueryRow(`SELECT expires_at FROM sessions`).Scan(&expiry); err != nil {
		t.Fatal(err)
	}
	if _, err := time.Parse(time.RFC3339Nano, expiry); err != nil {
		t.Fatal(err)
	}
	var base, key, models string
	var weight int
	if err := st.DB.QueryRow(`SELECT base_url,api_key,models_json,weight FROM channels`).Scan(&base, &key, &models, &weight); err != nil || base != "https://provider.test/v1" || key != "upstream-secret" || models != `["chat-model"]` || weight != 1 {
		t.Fatalf("channel migration: %s %s %d %v", base, models, weight, err)
	}
	var requested, served string
	var cost int64
	if err := st.DB.QueryRow(`SELECT requested_model,served_model,cost_micros FROM usage_records`).Scan(&requested, &served, &cost); err != nil || requested != "requested" || served != "served" || cost != 200 {
		t.Fatalf("usage migration: %s %s %d %v", requested, served, cost, err)
	}
	var indexTable string
	if err := st.DB.QueryRow(`SELECT tbl_name FROM sqlite_master WHERE name='usage_workspace_created_idx'`).Scan(&indexTable); err != nil || indexTable != "usage_records" {
		t.Fatalf("index migration: %s %v", indexTable, err)
	}
	st.Close()
	st, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	var count int
	if err := st.DB.QueryRow(`SELECT count(*) FROM users`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("migration repeated: %d %v", count, err)
	}
	backups, err := filepath.Glob(filepath.Join(filepath.Dir(path), "backups", "legacy-*", "capi.sqlite"))
	if err != nil || len(backups) != 1 {
		t.Fatalf("backups: %v %v", backups, err)
	}
	backup, err := sql.Open("sqlite", backups[0])
	if err != nil {
		t.Fatal(err)
	}
	defer backup.Close()
	if err := backup.QueryRow(`SELECT balance_units FROM wallets`).Scan(&balance); err != nil || balance != 2500000 {
		t.Fatalf("legacy snapshot changed: %d %v", balance, err)
	}
}

func TestLegacyMigrationRollsBack(t *testing.T) {
	path := filepath.Join(t.TempDir(), "capi.sqlite")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT); INSERT INTO users VALUES(1,'keep@example.test')`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if st, err := Open(path); err == nil {
		st.Close()
		t.Fatal("incomplete legacy schema accepted")
	}
	db, err = sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var email string
	if err = db.QueryRow(`SELECT email FROM users WHERE id=1`).Scan(&email); err != nil || email != "keep@example.test" {
		t.Fatalf("legacy data not restored: %s %v", email, err)
	}
}
