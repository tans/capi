package ops

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func Backup(ctx context.Context, cfg config.Config, st *store.Store) (string, error) {
	root := filepath.Join(cfg.DataDir, "backups")
	stamp := time.Now().UTC().Format("20060102T150405Z")
	dst := filepath.Join(root, stamp)
	if err := os.MkdirAll(dst, 0o700); err != nil {
		return "", err
	}
	dbdst := filepath.Join(dst, "capi.sqlite")
	escaped := strings.ReplaceAll(dbdst, "'", "''")
	if _, err := st.DB.ExecContext(ctx, fmt.Sprintf("VACUUM INTO '%s'", escaped)); err != nil {
		return "", err
	}
	secret := filepath.Join(cfg.DataDir, "smtp.key")
	if _, err := os.Stat(secret); err == nil {
		if err := copyFile(secret, filepath.Join(dst, "smtp.key"), 0o600); err != nil {
			return "", err
		}
	} else if !os.IsNotExist(err) {
		return "", err
	}
	if _, err := os.Stat(cfg.FilesDir); err == nil {
		if err := copyDir(cfg.FilesDir, filepath.Join(dst, "files")); err != nil {
			return "", err
		}
	}
	entries, err := os.ReadDir(root)
	if err == nil {
		var dirs []string
		for _, e := range entries {
			if e.IsDir() {
				dirs = append(dirs, e.Name())
			}
		}
		sort.Sort(sort.Reverse(sort.StringSlice(dirs)))
		retention := cfg.BackupRetention
		var settings string
		if err := st.DB.QueryRowContext(ctx, `SELECT config_json FROM app_settings WHERE id=1`).Scan(&settings); err == nil {
			var stored struct {
				BackupRetention int `json:"backupRetention"`
			}
			if json.Unmarshal([]byte(settings), &stored) == nil && stored.BackupRetention > 0 {
				retention = stored.BackupRetention
			}
		}
		for _, name := range dirs[capped(retention, len(dirs)):] {
			_ = os.RemoveAll(filepath.Join(root, name))
		}
	}
	return dst, nil
}
func capped(n, total int) int {
	if n < 0 {
		return 0
	}
	if n > total {
		return total
	}
	return n
}
func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	if err := out.Sync(); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
		if err != nil {
			return err
		}
		_, cpErr := io.Copy(out, in)
		closeErr := out.Close()
		if cpErr != nil {
			return cpErr
		}
		return closeErr
	})
}
