# Storage architecture

## Current target

The first driver is libSQL. It supports both a local SQLite file and a remote
Turso database. Application repositories use the asynchronous contracts in
`lib/storage/contracts.ts`; the libSQL driver is implemented in
`lib/storage/libsql.ts`.

Database connection selection is centralized in `lib/storage/config.ts`:

- `DATABASE_URL` and `DATABASE_AUTH_TOKEN` are the generic settings.
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` remain accepted as aliases.
- With no URL or token configured, `CAPI_DB_PATH` selects a local SQLite file
  and defaults to `data/capi.sqlite`.
- A URL and token must be configured as a pair for remote connections. Conflicting
  generic and Turso-specific values are rejected.

## Adding a different database later

The SQL executor is a driver boundary, not a promise that arbitrary SQL is
portable. Business modules should move database statements into repository
modules and depend on repository methods. Each repository owns its SQL and
maps database rows to domain types. A future PostgreSQL driver can then provide
its own repository implementation where dialect differences require it.

Keep multi-row financial operations inside `StorageDatabase.transaction()`.
Never split balance changes, budget updates, idempotency records, and ledger
entries across independent commits.

Before adding another driver, audit SQL features used by the repository set,
including JSON functions, conflict clauses, `RETURNING`, collations, partial
indexes, integer behavior, and generated IDs. Add a driver only after those
semantics are represented by the repository contract or handled explicitly by
the driver implementation.
