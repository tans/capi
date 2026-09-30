import { AsyncLocalStorage } from "node:async_hooks";

import type { SqlExecutor, SqlValue, StorageDatabase } from "./contracts";

export type AsyncQueryStatement<Row> = {
  get(...args: SqlValue[]): Promise<Row | undefined>;
  all(...args: SqlValue[]): Promise<Row[]>;
  run(...args: SqlValue[]): Promise<{ changes: number; lastInsertRowid: number | bigint | null }>;
};

export type TransactionRunner<T> = (() => Promise<T>) & { immediate: () => Promise<T> };

/**
 * Transitional SQLite query facade. It preserves the repository's familiar
 * query shape while making every database operation asynchronous. New data
 * access code should use StorageDatabase/SqlExecutor directly.
 */
export class AsyncSqliteQueryAdapter {
  private readonly transactionContext = new AsyncLocalStorage<SqlExecutor>();
  private savepointSequence = 0;

  constructor(private readonly database: StorageDatabase) {}

  query<Row extends Record<string, unknown> = Record<string, unknown>, _Args extends readonly unknown[] = readonly unknown[]>(sql: string): AsyncQueryStatement<Row> {
    return {
      get: async (...args) => (await this.executor().execute<Row>({ sql, args })).rows[0],
      all: async (...args) => (await this.executor().execute<Row>({ sql, args })).rows,
      run: async (...args) => {
        const result = await this.executor().execute({ sql, args });
        return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
      },
    };
  }

  transaction<T>(work: () => T | Promise<T>): TransactionRunner<T> {
    const run = async (): Promise<T> => {
      const parent = this.transactionContext.getStore();
      if (!parent) {
        return this.database.transaction(
          (transaction) => this.transactionContext.run(transaction, async () => await work()),
        );
      }

      // Nested repository calls must share the outer connection. Opening another
      // write transaction would wait on the lock held by its own caller.
      const savepoint = `capi_nested_${++this.savepointSequence}`;
      await parent.execute(`SAVEPOINT ${savepoint}`);
      try {
        const result = await work();
        await parent.execute(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await parent.execute(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await parent.execute(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    };
    return Object.assign(run, { immediate: run });
  }

  async exec(sql: string): Promise<void> {
    for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
      await this.executor().execute(statement);
    }
  }

  close(): void {
    this.database.close();
  }

  private executor(): SqlExecutor {
    return this.transactionContext.getStore() ?? this.database;
  }
}
