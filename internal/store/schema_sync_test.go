package store

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

// The declarative schema must equal what the released migrations build, so
// developers editing schema.sql know immediately when they must also (or
// instead) add a migration for released databases.
func TestDeclarativeSchemaMatchesMigrations(t *testing.T) {
	st, err := Open(t.TempDir() + "/migrated.sqlite")
	if err != nil {
		t.Fatalf("open migrated db: %v", err)
	}
	defer st.Close()

	changes, err := SchemaDiff(context.Background(), st.DB, DeclarativeSchema)
	if err != nil {
		t.Fatalf("schema divergence between migrations and schema.sql: %v", err)
	}
	if len(changes) > 0 {
		t.Fatalf("migrations and schema.sql disagree; %s", PlanString(changes))
	}
}

func TestSchemaDiffCreatesMissingTableColumnIndex(t *testing.T) {
	db, err := sql.Open("sqlite", t.TempDir()+"/sync.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE existing (id TEXT PRIMARY KEY);`); err != nil {
		t.Fatal(err)
	}

	target := `CREATE TABLE existing (id TEXT PRIMARY KEY, nickname TEXT NOT NULL DEFAULT '');` + "\n" +
		`CREATE TABLE fresh (id TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '');` + "\n" +
		`CREATE INDEX existing_nick ON existing(nickname);` + "\n"
	changes, err := SchemaDiff(context.Background(), db, target)
	if err != nil {
		t.Fatal(err)
	}
	if len(changes) != 3 {
		t.Fatalf("want 3 changes, got %d: %s", len(changes), PlanString(changes))
	}
	if err := ApplySchemaChanges(context.Background(), db, changes); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"existing", "fresh"} {
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info(?)`, table).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n < 2 {
			t.Fatalf("table %s should have both columns after sync", table)
		}
	}
	var idx int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='existing_nick'`).Scan(&idx); err != nil || idx != 1 {
		t.Fatalf("index not created: %v %d", err, idx)
	}
	// Second sync must be a no-op.
	again, err := SchemaDiff(context.Background(), db, target)
	if err != nil {
		t.Fatal(err)
	}
	if len(again) != 0 {
		t.Fatalf("second sync not idempotent: %s", PlanString(again))
	}
}

func TestSchemaDiffRefusesDestructiveChanges(t *testing.T) {
	db, err := sql.Open("sqlite", t.TempDir()+"/guard.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE data (id TEXT PRIMARY KEY, secret TEXT NOT NULL); CREATE TABLE legacy_rows (id TEXT PRIMARY KEY);`); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name   string
		target string
	}{
		{"live column missing from schema", `CREATE TABLE data (id TEXT PRIMARY KEY);`},
		{"live table missing from schema", `CREATE TABLE data (id TEXT PRIMARY KEY, secret TEXT NOT NULL);`},
		{"column type drift", `CREATE TABLE data (id TEXT PRIMARY KEY, secret INTEGER NOT NULL);`},
		{"not-null column without default cannot be added", `CREATE TABLE data (id TEXT PRIMARY KEY, secret TEXT NOT NULL, extra INTEGER NOT NULL);`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := SchemaDiff(context.Background(), db, tc.target); err == nil {
				t.Fatal("expected refusal, got no error")
			}
		})
	}
}

func TestOpenSchemaSyncMode(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/dev.sqlite"
	st, err := OpenWithOptions(path, OpenOptions{SchemaMode: SchemaSync})
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	if _, err := st.DB.ExecContext(context.Background(), `SELECT COUNT(*) FROM sqlite_master`); err != nil {
		t.Fatal(err)
	}
	// Sync mode must converge and be idempotent.
	if _, err := SyncDev(context.Background(), st.DB); err != nil {
		t.Fatal(err)
	}
	again, err := SchemaDiff(context.Background(), st.DB, DeclarativeSchema)
	if err != nil {
		t.Fatal(err)
	}
	if len(again) != 0 {
		t.Fatalf("sync-mode database drifted: %s", PlanString(again))
	}
}

func TestSchemaSQLHasBalancedParensAndNoCommentInStrings(t *testing.T) {
	open := strings.Count(DeclarativeSchema, "(")
	close := strings.Count(DeclarativeSchema, ")")
	if open != close {
		t.Fatalf("unbalanced parens in schema.sql: %d vs %d", open, close)
	}
}
