package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr string
	DataDir string
	DBPath string
	FilesDir string
	PublicBaseURL string
	TrustedOrigins []string
	AdminEmail string
	JEVURL string
	AlertWebhookURL string
	RelayTimeout time.Duration
	BackupRetention int
	LogLevel string
}

func Load() Config {
	dataDir:=env("CAPI_DATA_DIR","data")
	dbPath:=env("CAPI_DB_PATH",filepath.Join(dataDir,"capi.sqlite"))
	filesDir:=env("CAPI_FILES_DIR",filepath.Join(dataDir,"files"))
	retention,_:=strconv.Atoi(env("CAPI_BACKUP_RETENTION","14"));if retention<1{retention=14}
	timeoutMS,_:=strconv.Atoi(env("CAPI_RELAY_TIMEOUT_MS","120000"));if timeoutMS<1000{timeoutMS=120000}
	return Config{
		Addr:env("CAPI_ADDR",":3210"),DataDir:dataDir,DBPath:dbPath,FilesDir:filesDir,
		PublicBaseURL:strings.TrimRight(env("CAPI_PUBLIC_BASE_URL","http://127.0.0.1:3210"),"/"),
		TrustedOrigins:splitCSV(os.Getenv("CAPI_TRUSTED_ORIGINS")),
		AdminEmail:strings.ToLower(strings.TrimSpace(os.Getenv("CAPI_ADMIN_EMAIL"))),
		JEVURL:strings.TrimRight(strings.TrimSpace(os.Getenv("CAPI_JEV_URL")),"/"),
		AlertWebhookURL:strings.TrimSpace(os.Getenv("CAPI_ALERT_WEBHOOK_URL")),
		RelayTimeout:time.Duration(timeoutMS)*time.Millisecond,BackupRetention:retention,LogLevel:env("CAPI_LOG_LEVEL","info"),
	}
}
func env(k,fallback string)string{if v:=strings.TrimSpace(os.Getenv(k));v!=""{return v};return fallback}
func splitCSV(v string)[]string{var out []string;for _,p:=range strings.Split(v,","){p=strings.TrimSpace(p);if p!=""{out=append(out,p)}};return out}
