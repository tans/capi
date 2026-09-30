package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"
)

// Recover billing history and unused codes both on a fresh Bun migration and
// on databases migrated by earlier Go builds. Archived tables are preserved.
func (s *Store) restoreLegacyBilling(ctx context.Context) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var restored int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM legacy_restore_state WHERE feature='billing'`).Scan(&restored); err != nil {
		return err
	}
	if restored > 0 {
		return nil
	}
	exists := func(name string) (bool, error) {
		var n int
		err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`, name).Scan(&n)
		return n > 0, err
	}
	ledger, err := exists("legacy_wallet_entries")
	if err != nil {
		return err
	}
	if ledger {
		_, err = tx.ExecContext(ctx, `DELETE FROM wallet_entries WHERE kind='opening' AND id LIKE 'opening_%' AND workspace_id IN (SELECT CAST(workspace_id AS TEXT) FROM legacy_wallet_entries);
INSERT INTO wallet_entries(id,workspace_id,kind,delta_micros,reason,reference_id,balance_micros,created_at)
SELECT 'legacy_entry_'||e.id,CAST(e.workspace_id AS TEXT),e.kind,e.delta_units*2,e.reason,'legacy_'||e.idempotency_key,
COALESCE((SELECT balance_units*2 FROM legacy_wallets WHERE workspace_id=e.workspace_id),0)-(SELECT COALESCE(SUM(delta_units),0)*2 FROM legacy_wallet_entries WHERE workspace_id=e.workspace_id)+(SELECT COALESCE(SUM(delta_units),0)*2 FROM legacy_wallet_entries p WHERE p.workspace_id=e.workspace_id AND (p.created_at<e.created_at OR (p.created_at=e.created_at AND p.id<=e.id))),
strftime('%Y-%m-%dT%H:%M:%fZ',e.created_at/1000.0,'unixepoch') FROM legacy_wallet_entries e`)
		if err != nil {
			return fmt.Errorf("restore legacy ledger: %w", err)
		}
	}
	codes, err := exists("legacy_redeem_codes")
	if err != nil {
		return err
	}
	if codes {
		credits, err := exists("legacy_redeem_code_credits")
		if err != nil {
			return err
		}
		query := `SELECT CAST(r.id AS TEXT),r.code,r.amount_quota,r.created_at,r.expires_at,r.redeemed_at,CAST(r.redeemed_by AS TEXT),NULL FROM legacy_redeem_codes r`
		if credits {
			query = `SELECT CAST(r.id AS TEXT),r.code,r.amount_quota,r.created_at,r.expires_at,r.redeemed_at,CAST(r.redeemed_by AS TEXT),CAST(c.workspace_id AS TEXT) FROM legacy_redeem_codes r LEFT JOIN legacy_redeem_code_credits c ON c.redeem_code_id=r.id`
		}
		rows, err := tx.QueryContext(ctx, query)
		if err != nil {
			return err
		}
		type code struct {
			id, text          string
			amount, created   int64
			expires, redeemed sql.NullInt64
			user, workspace   sql.NullString
		}
		values := []code{}
		for rows.Next() {
			var value code
			if err = rows.Scan(&value.id, &value.text, &value.amount, &value.created, &value.expires, &value.redeemed, &value.user, &value.workspace); err != nil {
				rows.Close()
				return err
			}
			values = append(values, value)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		stamp := func(value sql.NullInt64) any {
			if !value.Valid {
				return nil
			}
			return time.UnixMilli(value.Int64).UTC().Format(time.RFC3339Nano)
		}
		for _, value := range values {
			hash := sha256.Sum256([]byte(value.text))
			_, err = tx.ExecContext(ctx, `INSERT INTO redeem_codes(id,code_hash,secret_code,name,amount_micros,expires_at,created_at,redeemed_at,redeemed_workspace_id,redeemed_user_id) VALUES(?,?,?,'Imported credit',?,?,?,?,?,?)`, value.id, hex.EncodeToString(hash[:]), value.text, value.amount*2, stamp(value.expires), time.UnixMilli(value.created).UTC().Format(time.RFC3339Nano), stamp(value.redeemed), value.workspace, value.user)
			if err != nil {
				return fmt.Errorf("restore legacy redemption code: %w", err)
			}
		}
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO legacy_restore_state(feature) VALUES('billing')`); err != nil {
		return err
	}
	return tx.Commit()
}
