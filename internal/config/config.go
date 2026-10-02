package config

import (
	"context"
	"database/sql"
	"encoding/json"
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
	TrustedOrigins  []string
	AdminEmail      string
	JEVURL          string
	AlertWebhookURL string
	RelayTimeout    time.Duration
	BackupRetention int
	LogLevel        string
	Redact          bool
	CodexVersion    string
}

type SystemSettings struct {
	Addr            string   `json:"addr"`
	PublicBaseURL   string   `json:"publicBaseUrl"`
	TrustedOrigins  []string `json:"trustedOrigins"`
	AdminEmail      string   `json:"adminEmail"`
	JEVURL          string   `json:"jevUrl"`
	AlertWebhookURL string   `json:"alertWebhookUrl"`
	RelayTimeoutMs  int64    `json:"relayTimeoutMs"`
	BackupRetention int      `json:"backupRetention"`
	LogLevel        string   `json:"logLevel"`
	Redact          bool     `json:"redact"`
	CodexVersion    string   `json:"codexVersion"`
}

func Load() Config {
	dataDir := env("CAPI_DATA_DIR", "data")
	return Config{DataDir: dataDir, DBPath: filepath.Join(dataDir, "capi.sqlite"), FilesDir: filepath.Join(dataDir, "files"), CodexVersion: "0.159.2"}
}

func ApplySystemSettings(ctx context.Context, db *sql.DB, cfg Config) (Config, error) {
	settings := defaultSystemSettings()
	var raw string
	if err := db.QueryRowContext(ctx, `SELECT config_json FROM app_settings WHERE id=1`).Scan(&raw); err != nil {
		return cfg, err
	}
	if raw != "" && raw != "{}" {
		if err := json.Unmarshal([]byte(raw), &settings); err != nil {
			return cfg, err
		}
	}
	settings.normalize()
	cfg.Addr = settings.Addr
	cfg.PublicBaseURL = settings.PublicBaseURL
	cfg.TrustedOrigins = settings.TrustedOrigins
	cfg.AdminEmail = settings.AdminEmail
	cfg.JEVURL = settings.JEVURL
	cfg.AlertWebhookURL = settings.AlertWebhookURL
	cfg.RelayTimeout = time.Duration(settings.RelayTimeoutMs) * time.Millisecond
	cfg.BackupRetention = settings.BackupRetention
	cfg.LogLevel = settings.LogLevel
	cfg.Redact = settings.Redact
	cfg.CodexVersion = settings.CodexVersion
	return cfg, nil
}

func defaultSystemSettings() SystemSettings {
	return SystemSettings{Addr: ":3210", PublicBaseURL: "http://127.0.0.1:3210", TrustedOrigins: []string{"http://127.0.0.1:3210", "http://localhost:3210"}, RelayTimeoutMs: 120000, BackupRetention: 14, LogLevel: "info", CodexVersion: "0.159.2"}
}

func (s *SystemSettings) normalize() {
	if strings.TrimSpace(s.Addr) == "" {
		s.Addr = ":3210"
	}
	if strings.TrimRight(strings.TrimSpace(s.PublicBaseURL), "/") == "" {
		s.PublicBaseURL = "http://127.0.0.1:3210"
	} else {
		s.PublicBaseURL = strings.TrimRight(strings.TrimSpace(s.PublicBaseURL), "/")
	}
	var origins []string
	for _, origin := range s.TrustedOrigins {
		if origin = strings.TrimSpace(origin); origin != "" {
			origins = append(origins, origin)
		}
	}
	s.TrustedOrigins = origins
	s.AdminEmail = strings.ToLower(strings.TrimSpace(s.AdminEmail))
	s.JEVURL = strings.TrimRight(strings.TrimSpace(s.JEVURL), "/")
	s.AlertWebhookURL = strings.TrimSpace(s.AlertWebhookURL)
	if s.RelayTimeoutMs < 1000 || s.RelayTimeoutMs > 600000 {
		s.RelayTimeoutMs = 120000
	}
	if s.BackupRetention < 1 {
		s.BackupRetention = 14
	}
	s.LogLevel = strings.ToLower(strings.TrimSpace(s.LogLevel))
	if s.LogLevel != "debug" && s.LogLevel != "warn" && s.LogLevel != "error" {
		s.LogLevel = "info"
	}
	if strings.TrimSpace(s.CodexVersion) == "" {
		s.CodexVersion = "0.159.2"
	}
}
func env(k, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return fallback
}
