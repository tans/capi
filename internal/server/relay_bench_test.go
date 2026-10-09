package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/store"
)

// BenchmarkConcurrentRelay reproduces the acceptance benchmark for issue #30:
// authenticated relay requests against a mocked upstream (constant simulated
// upstream latency) while representative console reads run concurrently.
//
// It reports per-request latency percentiles (p50/p95), aggregate throughput,
// background console-read throughput, and database/sql pool wait counters.
//
// Compare the current single-connection configuration with the bounded pool:
//
//	CAPI_DB_MAX_CONNS=1  go test -tags webui_dist ./internal/server -run xxx -bench BenchmarkConcurrentRelay -benchtime 400x
//	CAPI_DB_MAX_CONNS=8  go test -tags webui_dist ./internal/server -run xxx -bench BenchmarkConcurrentRelay -benchtime 400x
func BenchmarkConcurrentRelay(b *testing.B) {
	const (
		clients       = 16 // documented benchmark concurrency
		consoleUsers  = 8  // background dashboard pollers
		upstreamDelay = 30 * time.Millisecond
	)
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(upstreamDelay)
		io.WriteString(w, `{"model":"bench-model","usage":{"prompt_tokens":100,"completion_tokens":10},"choices":[]}`)
	}))
	defer up.Close()

	st, err := store.Open(b.TempDir() + "/bench.sqlite")
	if err != nil {
		b.Fatal(err)
	}
	defer st.Close()
	s, _, cookie := benchFixture(b, st, up.URL)

	var consoleReads atomic.Int64
	stop := make(chan struct{})
	var readers sync.WaitGroup
	for i := 0; i < consoleUsers; i++ {
		readers.Add(1)
		go func() {
			defer readers.Done()
			req := httptest.NewRequest(http.MethodGet, "/api/workspaces/workspace/usage?limit=25", nil)
			req.AddCookie(cookie)
			for {
				select {
				case <-stop:
					return
				default:
				}
				w := httptest.NewRecorder()
				s.Handler().ServeHTTP(w, req)
				if w.Code != 200 {
					b.Errorf("console read failed: %d %s", w.Code, w.Body.String())
					return
				}
				consoleReads.Add(1)
			}
		}()
	}

	var mu sync.Mutex
	latencies := make([]time.Duration, 0, b.N)
	var next atomic.Int64
	next.Store(int64(b.N))
	var wg sync.WaitGroup
	b.ResetTimer()
	for c := 0; c < clients; c++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				if next.Add(-1) < 0 {
					return
				}
				req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"bench-model","messages":[],"max_tokens":10}`))
				req.Header.Set("Authorization", "Bearer test-secret")
				req.Header.Set("Content-Type", "application/json")
				w := httptest.NewRecorder()
				start := time.Now()
				s.Handler().ServeHTTP(w, req)
				elapsed := time.Since(start)
				if w.Code != 200 {
					b.Errorf("relay failed: %d %s", w.Code, w.Body.String())
					return
				}
				mu.Lock()
				latencies = append(latencies, elapsed)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	b.StopTimer()
	close(stop)
	readers.Wait()

	readsPerSec := float64(consoleReads.Load()) / float64(b.Elapsed().Seconds())
	stats := st.DB.Stats()
	b.ReportMetric(float64(stats.WaitCount)/float64(b.N), "pool-waits/op")
	b.ReportMetric(float64(stats.WaitDuration.Milliseconds())/float64(b.N), "pool-wait-ms/op")
	b.ReportMetric(readsPerSec, "console-reads/s")

	mu.Lock()
	defer mu.Unlock()
	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
	if len(latencies) == 0 {
		return
	}
	percentile := func(p float64) time.Duration {
		idx := int(p * float64(len(latencies)-1))
		return latencies[idx]
	}
	b.ReportMetric(float64(percentile(0.50).Milliseconds()), "p50-ms")
	b.ReportMetric(float64(percentile(0.95).Milliseconds()), "p95-ms")
}

// benchFixture mirrors billingFixture but balances the wallet for sustained
// billable traffic and points the channel at the mock upstream.
func benchFixture(t testing.TB, st *store.Store, upstreamURL string) (*Server, APIKey, *http.Cookie) {
	t.Helper()
	dir := t.TempDir()
	cfg := config.Load()
	cfg.DataDir = dir
	cfg.FilesDir = dir + "/files"
	s := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	now := time.Now().UTC().Format(time.RFC3339Nano)
	seeds := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('owner','bench@example.test','Bench','unused','admin',?)`, []any{now}},
		{`INSERT INTO workspaces(id,name,kind,created_at) VALUES('workspace','Bench','team',?)`, []any{now}},
		{`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES('workspace','owner','owner',?)`, []any{now}},
		{`INSERT INTO wallets(workspace_id,balance_micros,currency,updated_at) VALUES('workspace',1000000000000,'USD',?)`, []any{now}},
		{`INSERT INTO api_keys(id,workspace_id,name,key_hash,key_prefix,secret,scopes,created_at) VALUES('key','workspace','Key',?,'prefix','test-secret','*',?)`, []any{auth.HashToken("test-secret"), now}},
	}
	for _, seed := range seeds {
		if _, err := st.DB.Exec(seed.query, seed.args...); err != nil {
			t.Fatal(err)
		}
	}
	ch := provider.Channel{ID: "bench-up", Name: "Bench Upstream", APIKey: "bench", BaseURL: upstreamURL, Protocol: "openai", Models: []string{"bench-model"}, Enabled: true, Weight: 1, InputMicrosPerMillion: 1_000_000, OutputMicrosPerMillion: 1_000_000}
	if err := provider.Create(context.Background(), st, ch); err != nil {
		t.Fatal(err)
	}
	token, _, err := auth.CreateSession(context.Background(), st, "owner")
	if err != nil {
		t.Fatal(err)
	}
	return s, APIKey{ID: "key", WorkspaceID: "workspace", Name: "Key", Scopes: "*"}, &http.Cookie{Name: "capi_session", Value: token}
}
