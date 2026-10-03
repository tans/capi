package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/ops"
	"github.com/tans/capi/internal/provider"
	"github.com/tans/capi/internal/server"
	"github.com/tans/capi/internal/store"
	"github.com/tans/capi/internal/worker"
)

var version = "dev"

func main() {
	cfg := config.Load()
	log := ops.NewLogger(cfg.LogLevel)
	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Error("database_open_failed", "error", err)
		os.Exit(1)
	}
	defer st.Close()
	// Most settings are read from SQLite at request/task time. The listener and
	// logger need their initial values before the server starts.
	if startup, err := loadStartupSettings(context.Background(), st.DB); err == nil {
		cfg.Addr, cfg.LogLevel = startup.Addr, startup.LogLevel
	}
	provider.CodexVersion = "0.159.2"
	switch cmd {
	case "serve":
		serve(cfg, st, log)
	case "migrate":
		fmt.Println("migrations applied")
	case "backup":
		dst, err := ops.Backup(context.Background(), cfg, st)
		if err != nil {
			log.Error("backup_failed", "error", err)
			os.Exit(1)
		}
		fmt.Println(dst)
	case "doctor":
		doctor(cfg, st)
	case "version", "--version", "-v":
		fmt.Println(version)
	default:
		fmt.Fprintf(os.Stderr, "usage: capi [serve|migrate|backup|doctor|version]\n")
		os.Exit(2)
	}
}

type startupSettings struct {
	Addr     string `json:"addr"`
	LogLevel string `json:"logLevel"`
}

func loadStartupSettings(ctx context.Context, db *sql.DB) (startupSettings, error) {
	settings := startupSettings{Addr: ":3210", LogLevel: "info"}
	var raw string
	if err := db.QueryRowContext(ctx, `SELECT config_json FROM app_settings WHERE id=1`).Scan(&raw); err != nil {
		return settings, err
	}
	if raw != "" && raw != "{}" {
		if err := json.Unmarshal([]byte(raw), &settings); err != nil {
			return settings, err
		}
	}
	if settings.Addr == "" {
		settings.Addr = ":3210"
	}
	if settings.LogLevel == "" {
		settings.LogLevel = "info"
	}
	return settings, nil
}

func serve(cfg config.Config, st *store.Store, log interface {
	Info(string, ...any)
	Error(string, ...any)
}) {
	logger := ops.NewLogger(cfg.LogLevel)
	srv := server.New(cfg, st, logger)
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	go worker.New(cfg, st, logger).Run(ctx)
	go srv.KeepChatGPTSubscriptionsAlive(ctx)
	go func() {
		srv.DispatchNotifications(ctx)
		srv.QueueWeeklyDigests(ctx, time.Now())
		srv.DispatchWeeklyDigests(ctx)
		srv.DispatchProductNotifications(ctx)
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				srv.DispatchNotifications(ctx)
				srv.QueueWeeklyDigests(ctx, time.Now())
				srv.DispatchWeeklyDigests(ctx)
				srv.DispatchProductNotifications(ctx)
			}
		}
	}()
	httpSrv := &http.Server{Addr: cfg.Addr, Handler: srv.Handler(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 2 * time.Minute}
	go func() {
		<-ctx.Done()
		shutdownCtx, c := context.WithTimeout(context.Background(), 10*time.Second)
		defer c()
		_ = httpSrv.Shutdown(shutdownCtx)
	}()
	logger.Info("server_started", "addr", cfg.Addr, "version", version)
	if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("server_failed", "error", err)
		os.Exit(1)
	}
}

func doctor(cfg config.Config, st *store.Store) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := st.DB.PingContext(ctx); err != nil {
		fmt.Println("database: FAIL", err)
		os.Exit(1)
	}
	fmt.Println("database: ok")
	fmt.Println("database_path:", cfg.DBPath)
	fmt.Println("files_dir:", cfg.FilesDir)
}
