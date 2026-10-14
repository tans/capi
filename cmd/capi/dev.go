package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/ops"
	"github.com/tans/capi/internal/store"
)

// devDB returns the development database path. Dev databases are always kept
// separate from the production DB so sync mode can never touch real data.
func devDB(cfg config.Config) string {
	if v := os.Getenv("CAPI_DEV_DB"); v != "" {
		return v
	}
	return filepath.Join(cfg.DataDir, "dev", "capi.sqlite")
}

func runDev(args []string, cfg config.Config, log *slog.Logger) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: capi dev [sync|reset|snapshot]")
		return 2
	}
	ctx := context.Background()
	path := devDB(cfg)
	switch args[0] {
	case "sync":
		return devSync(ctx, path, log)
	case "reset":
		return devReset(path, log)
	case "snapshot":
		return devSnapshot(ctx, path, cfg, log)
	default:
		fmt.Fprintln(os.Stderr, "usage: capi dev [sync|reset|snapshot]")
		return 2
	}
}

func devSync(ctx context.Context, path string, log *slog.Logger) int {
	st, err := store.OpenWithOptions(path, store.OpenOptions{SchemaMode: store.SchemaSync})
	if err != nil {
		log.Error("schema_sync_failed", "error", err)
		return 1
	}
	defer st.Close()
	changes, err := store.SchemaDiff(ctx, st.DB, store.DeclarativeSchema)
	if err != nil {
		log.Error("schema_diff_failed", "error", err)
		return 1
	}
	if len(changes) == 0 {
		fmt.Printf("dev database %s is up to date\n", path)
		return 0
	}
	fmt.Print(store.PlanString(changes))
	if err := store.ApplySchemaChanges(ctx, st.DB, changes); err != nil {
		log.Error("schema_apply_failed", "error", err)
		return 1
	}
	fmt.Printf("synced %s\n", path)
	return 0
}

func devReset(path string, log *slog.Logger) int {
	if err := os.RemoveAll(filepath.Dir(path)); err != nil && !os.IsNotExist(err) {
		log.Error("dev_reset_failed", "error", err)
		return 1
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		log.Error("dev_reset_failed", "error", err)
		return 1
	}
	st, err := store.OpenWithOptions(path, store.OpenOptions{SchemaMode: store.SchemaSync})
	if err != nil {
		log.Error("dev_reset_failed", "error", err)
		return 1
	}
	defer st.Close()
	fmt.Printf("reset dev database %s\n", path)
	return 0
}

func devSnapshot(ctx context.Context, path string, cfg config.Config, log *slog.Logger) int {
	st, err := store.OpenWithOptions(path, store.OpenOptions{SchemaMode: store.SchemaSync})
	if err != nil {
		log.Error("snapshot_open_failed", "error", err)
		return 1
	}
	defer st.Close()
	// Backup's retention culls old snapshots; keep at least the recent ones.
	cfg.BackupRetention = 14
	dst, err := ops.Backup(ctx, cfg, st)
	if err != nil {
		log.Error("snapshot_failed", "error", err)
		return 1
	}
	fmt.Println(dst)
	return 0
}
