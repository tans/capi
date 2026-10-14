package store

import (
	"bufio"
	"context"
	"database/sql"
	_ "embed" // used by //go:embed below
	"fmt"
	"regexp"
	"strings"
)

// Dev Schema Sync keeps a local development database converged with
// schema.sql. It is intentionally not a general schema-diff engine: it only
// applies safe, reversible changes automatically (create table, add a column
// with a default, create index). Anything destructive or ambiguous is
// reported as a plan and never executed, so a dev database can never lose
// data silently.
//
// Production databases never take this path; they keep upgrading through
// migrations.go. See OpenOptions.SchemaMode.

//go:embed schema.sql
var DeclarativeSchema string

type SchemaChange struct {
	Kind string // "create_table", "add_column", "create_index"
	SQL  string
}

// SchemaDiff returns the safe changes needed to bring db in line with the
// declarative schema. Requires reads only. The caller decides what to apply.
func SchemaDiff(ctx context.Context, db *sql.DB, target string) ([]SchemaChange, error) {
	tables, err := parseSchema(target)
	if err != nil {
		return nil, err
	}
	live, err := liveObjects(ctx, db)
	if err != nil {
		return nil, err
	}
	var changes []SchemaChange
	for _, t := range tables {
		existing, ok := live.tables[t.name]
		if !ok {
			changes = append(changes, SchemaChange{Kind: "create_table", SQL: t.create})
			for _, idx := range t.indexes {
				if _, has := live.indexes[idx.name]; !has {
					changes = append(changes, SchemaChange{Kind: "create_index", SQL: idx.create})
				}
			}
			continue
		}
		for _, col := range t.columns {
			if _, has := existing.columns[col.name]; has {
				continue
			}
			if !col.safeToAdd {
				return nil, fmt.Errorf("schema drift on %s: column %q needs a manual migration (no default or non-null), use capi dev plan or a migration", t.name, col.name)
			}
			changes = append(changes, SchemaChange{Kind: "add_column", SQL: fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s", t.name, col.definition)})
		}
		// Column type/constraint drift on existing columns is never auto-fixed.
		for name, liveCol := range existing.columns {
			if _, in := colMap(t.columns)[name]; !in {
				return nil, fmt.Errorf("schema drift on %s: live column %q is not in schema.sql; refusing to drop it", t.name, name)
			}
			if !strings.EqualFold(liveCol, "BLOB") && !typeCompatible(colMap(t.columns)[name].typ, liveCol) {
				return nil, fmt.Errorf("schema drift on %s: column %q type mismatch (%s live vs %s schema)", t.name, name, liveCol, colMap(t.columns)[name].typ)
			}
		}
		for _, idx := range t.indexes {
			if _, has := live.indexes[idx.name]; !has {
				changes = append(changes, SchemaChange{Kind: "create_index", SQL: idx.create})
			}
		}
	}
	for name := range live.tables {
		if !tableSet(tables)[name] {
			return nil, fmt.Errorf("schema drift: live table %q is not in schema.sql; refusing to drop it", name)
		}
	}
	for name := range live.indexes {
		if !indexSet(tables)[name] {
			return nil, fmt.Errorf("schema drift: live index %q is not in schema.sql; refusing to drop it", name)
		}
	}
	return changes, nil
}

// ApplySchemaChanges executes safe changes in a single transaction.
func ApplySchemaChanges(ctx context.Context, db *sql.DB, changes []SchemaChange) error {
	if len(changes) == 0 {
		return nil
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, c := range changes {
		if _, err := tx.ExecContext(ctx, c.SQL); err != nil {
			return fmt.Errorf("apply %s failed: %w", c.SQL, err)
		}
	}
	return tx.Commit()
}

func typeCompatible(schema, live string) bool {
	a, b := strings.ToUpper(strings.TrimSpace(schema)), strings.ToUpper(strings.TrimSpace(live))
	return a == b
}

type tableSpec struct {
	name    string
	create  string
	columns []columnSpec
	indexes []indexSpec
}

type columnSpec struct {
	name       string
	definition string // full "name TYPE ..." fragment used for ADD COLUMN
	typ        string
	safeToAdd  bool
}

type indexSpec struct {
	name   string
	create string
}

type liveTable struct {
	columns map[string]string // name -> declared type
}

type liveObjects_ struct {
	tables  map[string]liveTable
	indexes map[string]bool
}

func colMap(cols []columnSpec) map[string]columnSpec {
	out := make(map[string]columnSpec, len(cols))
	for _, c := range cols {
		out[c.name] = c
	}
	return out
}

func tableSet(tables []tableSpec) map[string]bool {
	out := make(map[string]bool, len(tables))
	for _, t := range tables {
		out[t.name] = true
	}
	return out
}

func indexSet(tables []tableSpec) map[string]bool {
	out := make(map[string]bool)
	for _, t := range tables {
		for _, i := range t.indexes {
			out[i.name] = true
		}
	}
	return out
}

var (
	createTableRE = regexp.MustCompile(`(?is)^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(\S+)\s*\((.*)\)\s*$`)
	createIndexRE = regexp.MustCompile(`(?is)^CREATE(?:\s+UNIQUE)?\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+(\S+)\s+ON\s+`)
	columnRE      = regexp.MustCompile(`(?is)^\s*(\S+)\s+(INTEGER|REAL|TEXT|BLOB|NUMERIC)(\b.*)?$`)
)

// parseSchema splits schema.sql into table and index specs. Statements must
// end with ';' at line level; the file format is maintained by the repo, not
// by arbitrary user SQL.
func parseSchema(target string) ([]tableSpec, error) {
	var tables []tableSpec
	sc := bufio.NewScanner(strings.NewReader(target))
	var stmt strings.Builder
	flush := func() error {
		text := strings.TrimSpace(stmt.String())
		stmt.Reset()
		if text == "" || strings.HasPrefix(text, "--") {
			return nil
		}
		text = strings.TrimSuffix(text, ";")
		text = strings.TrimSpace(text)
		if m := createTableRE.FindStringSubmatch(text); m != nil {
			t, err := parseTable(strings.TrimSpace(m[1]), text)
			if err != nil {
				return err
			}
			tables = append(tables, t)
			return nil
		}
		if m := createIndexRE.FindStringSubmatch(text); m != nil {
			name := strings.TrimSpace(m[1])
			if len(tables) == 0 {
				return fmt.Errorf("index %s declared before its table", name)
			}
			// attach to the table it belongs to by scanning ON <table>
			on := regexp.MustCompile(`(?is)\s+ON\s+([^\s(]+)`).FindStringSubmatch(text)
			if len(on) != 2 {
				return fmt.Errorf("index %s has no ON clause", name)
			}
			targetTable := strings.TrimSpace(on[1])
			for i := range tables {
				if tables[i].name == targetTable {
					tables[i].indexes = append(tables[i].indexes, indexSpec{name: name, create: text + ";"})
					return nil
				}
			}
			return fmt.Errorf("index %s references unknown table %s", name, targetTable)
		}
		return fmt.Errorf("unsupported statement in schema.sql: %.80q", text)
	}
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(strings.TrimSpace(line), "--") || strings.TrimSpace(line) == "" {
			continue
		}
		stmt.WriteString(line)
		stmt.WriteString("\n")
		// A statement may span multiple lines; only terminate on a line whose
		// trailing ';' is outside quotes. schema.sql keeps table bodies free of
		// quoted semicolons, so a simple split on the last ';' is fine.
		if strings.Contains(line, ";") {
			if err := flush(); err != nil {
				return nil, err
			}
		}
	}
	if err := flush(); err != nil {
		return nil, err
	}
	return tables, nil
}

func parseTable(name, create string) (tableSpec, error) {
	m := createTableRE.FindStringSubmatch(create)
	if m == nil {
		return tableSpec{}, fmt.Errorf("bad CREATE TABLE: %.80q", create)
	}
	body := m[2]
	t := tableSpec{name: name, create: create + ";"}
	// Split top-level column fragments, ignoring parentheses nesting so
	// CHECK(...)/FOREIGN KEY(...) do not split.
	depth := 0
	start := 0
	for i, r := range body {
		switch r {
		case '(':
			depth++
		case ')':
			depth--
		case ',':
			if depth == 0 {
				if f := strings.TrimSpace(body[start:i]); f != "" {
					if col, ok := parseColumn(f); ok {
						t.columns = append(t.columns, col)
					}
				}
				start = i + 1
			}
		}
	}
	if f := strings.TrimSpace(body[start:]); f != "" {
		if col, ok := parseColumn(f); ok {
			t.columns = append(t.columns, col)
		}
	}
	return t, nil
}

func parseColumn(fragment string) (columnSpec, bool) {
	fragment = strings.TrimSpace(fragment)
	if fragment == "" {
		return columnSpec{}, false
	}
	// Skip PRIMARY KEY(...), UNIQUE(...), FOREIGN KEY(...), CHECK(...)
	upper := strings.ToUpper(fragment)
	for _, prefix := range []string{"PRIMARY KEY", "UNIQUE", "FOREIGN KEY", "CHECK"} {
		if strings.HasPrefix(upper, prefix) {
			return columnSpec{}, false
		}
	}
	m := columnRE.FindStringSubmatch(fragment)
	if m == nil {
		return columnSpec{}, false
	}
	name := strings.TrimSpace(m[1])
	typ := strings.ToUpper(strings.TrimSpace(m[2]))
	safe := true
	rest := strings.ToUpper(strings.TrimSpace(m[3]))
	if strings.Contains(rest, "NOT NULL") && !strings.Contains(rest, "DEFAULT") {
		safe = false // cannot add NOT NULL without a default to a live table
	}
	if strings.Contains(rest, "PRIMARY KEY") || strings.Contains(rest, "UNIQUE") {
		safe = false
	}
	return columnSpec{name: name, definition: fragment, typ: typ, safeToAdd: safe}, true
}

func liveObjects(ctx context.Context, db *sql.DB) (liveObjects_, error) {
	out := liveObjects_{tables: map[string]liveTable{}, indexes: map[string]bool{}}
	rows, err := db.QueryContext(ctx, `SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'`)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind, name, sql string
		if err := rows.Scan(&kind, &name, &sql); err != nil {
			return out, err
		}
		switch kind {
		case "table":
			cols, err := liveColumns(ctx, db, name)
			if err != nil {
				return out, err
			}
			out.tables[name] = liveTable{columns: cols}
		case "index":
			out.indexes[name] = true
		}
	}
	return out, rows.Err()
}

func liveColumns(ctx context.Context, db *sql.DB, table string) (map[string]string, error) {
	rows, err := db.QueryContext(ctx, `SELECT name,type FROM pragma_table_info(?)`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var name, typ string
		if err := rows.Scan(&name, &typ); err != nil {
			return nil, err
		}
		out[name] = typ
	}
	return out, rows.Err()
}

// SyncDev applies declarative schema changes to a dev database. It never runs
// release migrations and never drops anything.
func SyncDev(ctx context.Context, db *sql.DB) ([]SchemaChange, error) {
	changes, err := SchemaDiff(ctx, db, DeclarativeSchema)
	if err != nil {
		return nil, err
	}
	return changes, ApplySchemaChanges(ctx, db, changes)
}

// String renders a human-readable diff plan (like "2 safe changes").
func PlanString(changes []SchemaChange) string {
	var b strings.Builder
	counts := map[string]int{}
	for _, c := range changes {
		counts[c.Kind]++
	}
	fmt.Fprintf(&b, "%d safe change(s)\n", len(changes))
	for _, c := range changes {
		fmt.Fprintf(&b, "  %s\n", c.SQL)
	}
	return b.String()
}
