package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/ops"
	"github.com/tans/capi/internal/store"
)

func main() {
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: capi-admin [--data-path PATH] list")
		fmt.Fprintln(os.Stderr, "       capi-admin [--data-path PATH] backup")
		fmt.Fprintln(os.Stderr, "       capi-admin [--data-path PATH] set-role EMAIL user|admin")
		fmt.Fprintln(os.Stderr, "       capi-admin [--data-path PATH] set-password EMAIL PASSWORD")
		fmt.Fprintln(os.Stderr, "       capi-admin [--data-path PATH] set-balance EMAIL AMOUNT")
		fmt.Fprintln(os.Stderr, "       capi-admin [--data-path PATH] ensure-origins URL [URL ...]")
	}
	dataPath := flag.String("data-path", "", "SQLite data directory; defaults to CAPI_DATA_PATH or data")
	flag.Parse()
	if flag.NArg() < 1 {
		flag.Usage()
		os.Exit(2)
	}

	path := *dataPath
	if path == "" {
		path = config.Load().DataDir
	}
	path, _ = filepath.Abs(path)
	st, err := store.Open(filepath.Join(path, "capi.sqlite"))
	if err != nil {
		fatal(err)
	}
	defer st.Close()

	ctx := context.Background()
	switch flag.Arg(0) {
	case "backup":
		if flag.NArg() != 1 {
			flag.Usage()
			os.Exit(2)
		}
		backup, err := ops.Backup(ctx, config.Config{DataDir: path, FilesDir: filepath.Join(path, "files")}, st)
		if err != nil {
			fatal(err)
		}
		fmt.Println(backup)
	case "list":
		if flag.NArg() != 1 {
			flag.Usage()
			os.Exit(2)
		}
		listUsers(ctx, st)
	case "set-role":
		if flag.NArg() != 3 || (flag.Arg(2) != "user" && flag.Arg(2) != "admin") {
			flag.Usage()
			os.Exit(2)
		}
		mutate(ctx, st, path, func() error { return setRole(ctx, st, flag.Arg(1), flag.Arg(2)) })
	case "set-password":
		if flag.NArg() != 3 || len(flag.Arg(2)) < 8 {
			flag.Usage()
			os.Exit(2)
		}
		mutate(ctx, st, path, func() error { return setPassword(ctx, st, flag.Arg(1), flag.Arg(2)) })
	case "set-balance":
		if flag.NArg() != 3 {
			flag.Usage()
			os.Exit(2)
		}
		amount, err := strconv.ParseFloat(flag.Arg(2), 64)
		if err != nil || math.IsNaN(amount) || math.IsInf(amount, 0) || amount < 0 {
			fatal(fmt.Errorf("balance must be a finite non-negative number"))
		}
		mutate(ctx, st, path, func() error { return setBalance(ctx, st, flag.Arg(1), amount) })
	case "ensure-origins":
		if flag.NArg() < 2 {
			flag.Usage()
			os.Exit(2)
		}
		mutate(ctx, st, path, func() error { return ensureOrigins(ctx, st, flag.Args()[1:]) })
	default:
		flag.Usage()
		os.Exit(2)
	}
}

func ensureOrigins(ctx context.Context, st *store.Store, origins []string) error {
	var raw string
	if err := st.DB.QueryRowContext(ctx, `SELECT config_json FROM app_settings WHERE id=1`).Scan(&raw); err != nil {
		return err
	}
	var settings map[string]any
	if raw == "" || raw == "{}" {
		settings = map[string]any{}
	} else if err := json.Unmarshal([]byte(raw), &settings); err != nil {
		return err
	}
	seen := map[string]bool{}
	var merged []string
	if existing, ok := settings["trustedOrigins"].([]any); ok {
		for _, value := range existing {
			if origin, ok := value.(string); ok && strings.TrimSpace(origin) != "" && !seen[origin] {
				seen[origin] = true
				merged = append(merged, origin)
			}
		}
	}
	for _, origin := range origins {
		origin = strings.TrimRight(strings.TrimSpace(origin), "/")
		if origin != "" && !seen[origin] {
			seen[origin] = true
			merged = append(merged, origin)
		}
	}
	settings["trustedOrigins"] = merged
	encoded, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	if _, err := st.DB.ExecContext(ctx, `UPDATE app_settings SET config_json=? WHERE id=1`, string(encoded)); err != nil {
		return err
	}
	fmt.Printf("trusted origins: %s\n", strings.Join(merged, ", "))
	return nil
}

func setPassword(ctx context.Context, st *store.Store, email, password string) error {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	result, err := st.DB.ExecContext(ctx, `UPDATE users SET password_hash=? WHERE lower(email)=lower(?)`, hash, email)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count != 1 {
		return fmt.Errorf("user not found: %s", email)
	}
	if _, err := st.DB.ExecContext(ctx, `DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE lower(email)=lower(?))`, email); err != nil {
		return err
	}
	fmt.Printf("%s: password updated and existing sessions revoked\n", email)
	return nil
}

type user struct {
	ID, Email, Name, Role, Created string
	Balance                        int64
}

func listUsers(ctx context.Context, st *store.Store) {
	rows, err := st.DB.QueryContext(ctx, `SELECT u.email,u.name,u.role,u.created_at,
	COALESCE((SELECT x.balance_micros FROM workspaces pw JOIN workspace_members pm ON pm.workspace_id=pw.id AND pm.user_id=u.id AND pm.role='owner' JOIN wallets x ON x.workspace_id=pw.id WHERE pw.kind='personal' ORDER BY pw.created_at LIMIT 1),0)
	FROM users u ORDER BY u.created_at DESC,u.id`)
	if err != nil {
		fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var u user
		if err := rows.Scan(&u.Email, &u.Name, &u.Role, &u.Created, &u.Balance); err != nil {
			fatal(err)
		}
		fmt.Printf("%s\t%s\t%s\t%.6f\t%s\n", u.Email, u.Role, u.Name, float64(u.Balance)/1_000_000, u.Created)
	}
	if err := rows.Err(); err != nil {
		fatal(err)
	}
}

func mutate(ctx context.Context, st *store.Store, dataPath string, action func() error) {
	backup, err := ops.Backup(ctx, config.Config{DataDir: dataPath, FilesDir: filepath.Join(dataPath, "files")}, st)
	if err != nil {
		fatal(fmt.Errorf("backup before mutation: %w", err))
	}
	if err := action(); err != nil {
		fatal(err)
	}
	fmt.Printf("updated; backup=%s\n", backup)
}

func setRole(ctx context.Context, st *store.Store, email, role string) error {
	tx, err := st.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id, current string
	if err := tx.QueryRowContext(ctx, `SELECT id,role FROM users WHERE lower(email)=lower(?)`, email).Scan(&id, &current); err != nil {
		return fmt.Errorf("user not found: %s", email)
	}
	if current == "admin" && role == "user" {
		var admins int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role='admin'`).Scan(&admins); err != nil {
			return err
		}
		if admins <= 1 {
			return fmt.Errorf("the last administrator cannot be demoted")
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET role=? WHERE id=?`, role, id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	fmt.Printf("%s: role %s -> %s\n", email, current, role)
	return nil
}

func setBalance(ctx context.Context, st *store.Store, email string, amount float64) error {
	var raw string
	if err := st.DB.QueryRowContext(ctx, `SELECT config_json FROM app_settings WHERE id=1`).Scan(&raw); err != nil {
		return err
	}
	rate := 1.0
	var settings struct {
		Currency struct {
			Rate float64 `json:"rate"`
		} `json:"currency"`
	}
	if json.Unmarshal([]byte(raw), &settings) == nil && settings.Currency.Rate > 0 {
		rate = settings.Currency.Rate
	}
	micros := amount / rate * 1_000_000
	if math.IsInf(micros, 0) || micros > math.MaxInt64 {
		return fmt.Errorf("balance exceeds supported amount")
	}
	tx, err := st.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id, workspace string
	var current, reserved int64
	err = tx.QueryRowContext(ctx, `SELECT u.id,pw.id,x.balance_micros,x.reserved_micros FROM users u JOIN workspace_members pm ON pm.user_id=u.id AND pm.role='owner' JOIN workspaces pw ON pw.id=pm.workspace_id AND pw.kind='personal' JOIN wallets x ON x.workspace_id=pw.id WHERE lower(u.email)=lower(?) ORDER BY pw.created_at LIMIT 1`, email).Scan(&id, &workspace, &current, &reserved)
	if err != nil {
		return fmt.Errorf("user wallet not found: %s", email)
	}
	target := int64(math.Round(micros))
	if target < reserved {
		return fmt.Errorf("balance cannot be lower than reserved funds")
	}
	now := "datetime('now')"
	if _, err := tx.ExecContext(ctx, `UPDATE wallets SET balance_micros=?,updated_at=`+now+` WHERE workspace_id=?`, target, workspace); err != nil {
		return err
	}
	if target != current {
		if _, err := tx.ExecContext(ctx, `INSERT INTO wallet_entries(id,workspace_id,kind,delta_micros,reason,reference_id,balance_micros,created_at) VALUES(?,?,?,?,?,?,?,`+now+`)`, "adminbal_"+strings.ReplaceAll(id, "usr_", ""), workspace, "adjustment", target-current, "Administrator balance adjustment", "adminbal_"+id+fmt.Sprint(target), target); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	fmt.Printf("%s: balance %.6f -> %.6f\n", email, float64(current)/1_000_000*rate, amount)
	return nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "capi-admin:", err)
	os.Exit(1)
}
