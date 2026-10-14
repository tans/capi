package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

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
		return devReset(ctx, path, log)
	case "snapshot":
		return devSnapshot(ctx, path, cfg, log)
	case "restore":
		return devRestore(ctx, path, cfg, log, args[1:])
	default:
		fmt.Fprintln(os.Stderr, "usage: capi dev [sync|reset|snapshot|restore]")
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

func devReset(ctx context.Context, path string, log *slog.Logger) int {
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
	if err := store.SeedDev(ctx, st.DB); err != nil {
		log.Error("dev_reset_failed", "error", err)
		return 1
	}
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

// devRestore replaces the dev database with a snapshot produced by
// `capi dev snapshot` (a Backup directory), then re-syncs it to the current
// schema so restores never carry stale structure.
func devRestore(ctx context.Context, path string, cfg config.Config, log *slog.Logger, args []string) int {
	src := filepath.Join(cfg.DataDir, "backups")
	if len(args) > 0 && args[0] != "" {
		switch {
		case filepath.IsAbs(args[0]), strings.Contains(args[0], "/"), strings.Contains(args[0], string(os.PathSeparator)):
			src = args[0]
		default: // bare snapshot directory name, e.g. 20261014T160112Z
			src = filepath.Join(src, args[0])
		}
	}
	restore := filepath.Join(src, "capi.sqlite")
	if _, err := os.Stat(restore); err != nil {
		log.Error("restore_failed", "error", fmt.Errorf("no snapshot at %s: %w", restore, err))
		return 1
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		log.Error("restore_failed", "error", err)
		return 1
	}
	if err := copyFileEx(restore, path); err != nil {
		log.Error("restore_failed", "error", err)
		return 1
	}
	if code := devSync(ctx, path, log); code != 0 {
		log.Error("restore_failed", "error", fmt.Errorf("re-sync after restore failed"))
		return code
	}
	fmt.Printf("restored %s from %s\n", path, src)
	return 0
}

// copyFileEx copies a single file, replacing the destination. Kept local to
// the dev CLI; ops.copyFile is unexported.
func copyFileEx(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
