/** Common bind values used by the application, independent of any SQL driver. */
export type SqlValue = null | string | number | bigint | boolean | ArrayBuffer | Uint8Array | Date;

export type SqlStatement = string | {
  sql: string;
  args?: SqlValue[] | Record<string, SqlValue>;
};

export type SqlResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
  rows: Row[];
  rowsAffected: number;
  lastInsertRowid: number | bigint | null;
};

/**
 * Driver-neutral boundary for repositories. Application code should depend on
 * repository methods, while repository implementations use this async SQL API.
 */
export interface SqlExecutor {
  execute<Row extends Record<string, unknown> = Record<string, unknown>>(
    statement: SqlStatement,
  ): Promise<SqlResult<Row>>;
}

export interface StorageDatabase extends SqlExecutor {
  transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T>;
  close(): void;
}

export type StorageConfig = {
  url: string;
  authToken?: string;
  localPath?: string;
};
