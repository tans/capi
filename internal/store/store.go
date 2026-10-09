package store

import (
	"context"
	"database/sql"
	"fmt"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Store struct{ DB *sql.DB }

// Pool sizing: WAL mode allows any number of concurrent readers plus one
// writer, so the pool opens several connections and short local reads overlap
// instead of queueing behind a single connection. Writes stay safe: SQLite
// still permits one writer at a time, and every transaction began through
// database/sql takes the write lock immediately (DSN _txlock=immediate), so
// concurrent writers queue on busy_timeout instead of failing with
// "database is locked". CAPI_DB_MAX_CONNS overrides the default for
// constrained deployments.
func maxOpenConns() int {
	if v := strings.TrimSpace(os.Getenv("CAPI_DB_MAX_CONNS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 {
			return n
		}
	}
	return min(max(runtime.GOMAXPROCS(0), 4), 16)
}

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	// Every pooled connection runs these PRAGMAs on open: WAL for concurrent
	// readers, foreign key enforcement, and a 5s busy timeout before a lock
	// attempt gives up.
	db, err := sql.Open("sqlite", path+"?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_txlock=immediate")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(maxOpenConns())
	db.SetMaxIdleConns(maxOpenConns())
	s := &Store{DB: db}
	if err := s.migrateLegacy(context.Background(), path); err != nil {
		db.Close()
		return nil, err
	}
	if err := s.Migrate(context.Background()); err != nil {
		db.Close()
		return nil, err
	}
	if err := s.restoreLegacyBilling(context.Background()); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}
func (s *Store) Migrate(ctx context.Context) error {
	for i, migration := range migrations {
		version := i + 1
		var exists int
		err := s.DB.QueryRowContext(ctx, "SELECT COUNT(1) FROM schema_migrations WHERE version=?", version).Scan(&exists)
		if err != nil && i > 0 {
			return err
		}
		if i == 0 {
			if _, err := s.DB.ExecContext(ctx, migration); err != nil {
				return err
			}
			_ = s.DB.QueryRowContext(ctx, "SELECT COUNT(1) FROM schema_migrations WHERE version=?", version).Scan(&exists)
		}
		if exists > 0 {
			continue
		}
		tx, err := s.DB.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, migration); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %d: %w", version, err)
		}
		if _, err = tx.ExecContext(ctx, "INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)", version, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
			tx.Rollback()
			return err
		}
		if err = tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
func (s *Store) Close() error { return s.DB.Close() }
