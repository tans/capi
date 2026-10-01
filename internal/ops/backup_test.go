package ops

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestBackupIncludesEncryptedSMTPKeyWithPrivateMode(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "capi.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	key := []byte("example-encryption-key-material")
	if err := os.WriteFile(filepath.Join(dir, "smtp.key"), key, 0o600); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{DataDir: dir, FilesDir: filepath.Join(dir, "files"), BackupRetention: 2}
	backup, err := Backup(context.Background(), cfg, st)
	if err != nil {
		t.Fatal(err)
	}
	copied, err := os.ReadFile(filepath.Join(backup, "smtp.key"))
	if err != nil || string(copied) != string(key) {
		t.Fatalf("copied key %q: %v", copied, err)
	}
	info, err := os.Stat(filepath.Join(backup, "smtp.key"))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("backup key permissions %v: %v", info, err)
	}
}
