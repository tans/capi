package config

import (
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Config struct {
	Addr            string
	DataDir         string
	DBPath          string
	FilesDir        string
	PublicBaseURL   string
	AdminEmail      string
	AlertWebhookURL string
	RelayTimeout    time.Duration
	BackupRetention int
	LogLevel        string
	Redact          bool
	CodexVersion    string
}

func Load() Config {
	dataDir := env("CAPI_DATA_PATH", "data")
	return Config{DataDir: dataDir, DBPath: filepath.Join(dataDir, "capi.sqlite"), FilesDir: filepath.Join(dataDir, "files"), CodexVersion: "0.159.2"}
}

func env(k, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return fallback
}
