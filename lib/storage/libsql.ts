import { createClient, type Client, type Transaction } from "@libsql/client";

import type { SqlExecutor, SqlResult, SqlStatement, StorageDatabase } from "./contracts";
import { resolveStorageConfig } from "./config";

function asResult<Row extends Record<string, unknown>>(
  result: Awaited<ReturnType<Client["execute"]>>,
): SqlResult<Row> {
  return {
    rows: result.rows as unknown as Row[],
    rowsAffected: result.rowsAffected,
    lastInsertRowid: result.lastInsertRowid ?? null,
  };
}

function transactionExecutor(transaction: Transaction): SqlExecutor {
  return {
    async execute<Row extends Record<string, unknown> = Record<string, unknown>>(statement: SqlStatement) {
      return asResult<Row>(await transaction.execute(statement));
    },
  };
}

/** Current SQLite-family driver: local SQLite files and remote Turso databases. */
export function createStorageDatabase(): StorageDatabase {
  const config = resolveStorageConfig();
  const client = createClient({
    url: config.url,
    ...(config.authToken ? { authToken: config.authToken } : {}),
    intMode: "number",
  });

  return {
    async execute<Row extends Record<string, unknown> = Record<string, unknown>>(statement: SqlStatement) {
      return asResult<Row>(await client.execute(statement));
    },
    async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
      const transaction = await client.transaction("write");
      try {
        const result = await work(transactionExecutor(transaction));
        await transaction.commit();
        return result;
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },
    close() {
      client.close();
    },
  };
}

let sharedDatabase: StorageDatabase | undefined;

/** Shared process connection used by repository implementations. */
export function getStorageDatabase(): StorageDatabase {
  sharedDatabase ??= createStorageDatabase();
  return sharedDatabase;
}
