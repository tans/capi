package store

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

// With WAL, readers must overlap instead of queueing behind one connection.
// Reads are long enough that a single-connection pool would serialize them
// into a much longer wall-clock time.
func TestOpenAllowsConcurrentReads(t *testing.T) {
	s, err := Open(t.TempDir() + "/test.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	if _, err := s.DB.Exec(`CREATE TABLE pool_probe (v TEXT)`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec(`INSERT INTO pool_probe VALUES ('x')`); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(50 * time.Millisecond)
	slowRead := func() error {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		rows, err := s.DB.QueryContext(ctx, `SELECT v FROM pool_probe`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var v string
			if err := rows.Scan(&v); err != nil {
				return err
			}
			time.Sleep(30 * time.Millisecond)
		}
		return rows.Err()
	}
	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := slowRead(); err != nil {
				t.Error(err)
			}
		}()
	}
	// Four reads at 30ms each take >=120ms when serialized; overlapping they
	// all finish well inside the deadline. If they have not, the pool is
	// serializing reads again.
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Until(deadline)):
		t.Fatal("concurrent reads appear serialized behind one connection")
	}
}

// Overlapping writes must stay serialized by SQLite without surfacing
// "database is locked" as an error: busy_timeout absorbs the queue, and
// committed state must be exactly one increment per goroutine.
func TestOpenSerializesConcurrentWriters(t *testing.T) {
	s, err := Open(t.TempDir() + "/test.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	if _, err := s.DB.Exec(`CREATE TABLE pool_counter (n INTEGER NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec(`INSERT INTO pool_counter VALUES (0)`); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tx, err := s.DB.BeginTx(context.Background(), nil)
			if err != nil {
				t.Error(err)
				return
			}
			defer tx.Rollback()
			var n int
			if err := tx.QueryRow(`SELECT n FROM pool_counter`).Scan(&n); err != nil {
				t.Error(err)
				return
			}
			if _, err := tx.Exec(`UPDATE pool_counter SET n=?`, n+1); err != nil {
				t.Error(err)
				return
			}
			if err := tx.Commit(); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	var n int
	if err := s.DB.QueryRow(`SELECT n FROM pool_counter`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 16 {
		t.Fatalf("lost updates: n=%d want 16", n)
	}
	var poolMax int
	if poolMax = s.DB.Stats().MaxOpenConnections; poolMax < 2 {
		t.Fatalf("pool is still single-connection: max=%d", poolMax)
	}
	if err := s.DB.Ping(); err != nil {
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatal(err)
		}
	}
}
