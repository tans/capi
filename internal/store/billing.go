package store

import (
	"context"
	"time"
)

// An expired lease belongs to an interrupted request. Mark it unknown rather
// than pretending that the upstream definitely did not execute the request.
func (s *Store) ExpireBillingLeases(ctx context.Context, now time.Time) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stamp := now.UTC().Format(time.RFC3339Nano)
	if _, err = tx.ExecContext(ctx, `UPDATE wallets SET reserved_micros=reserved_micros-COALESCE((SELECT SUM(amount_micros) FROM billing_reservations b WHERE b.workspace_id=wallets.workspace_id AND b.state='held' AND b.lease_expires_at<=?),0)`, stamp); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE billing_reservations SET state='unknown',updated_at=? WHERE state='held' AND lease_expires_at<=?`, stamp, stamp); err != nil {
		return err
	}
	return tx.Commit()
}
