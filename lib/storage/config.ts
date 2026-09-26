import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { StorageConfig } from "./contracts";

/**
 * Resolve connection settings once at process startup.
 *
 * Preferred names are DATABASE_URL / DATABASE_AUTH_TOKEN. The TURSO_* names
 * remain supported for deployments that already use Turso's documented vars.
 * With no URL configured, the app uses a local SQLite file.
 */
export function resolveStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  const tursoUrl = env.TURSO_DATABASE_URL?.trim();
  const databaseToken = env.DATABASE_AUTH_TOKEN?.trim();
  const tursoToken = env.TURSO_AUTH_TOKEN?.trim();

  if (databaseUrl && tursoUrl && databaseUrl !== tursoUrl) {
    throw new Error("Set only one of DATABASE_URL or TURSO_DATABASE_URL.");
  }
  if (databaseToken && tursoToken && databaseToken !== tursoToken) {
    throw new Error("Set only one of DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN.");
  }

  const configuredUrl = databaseUrl || tursoUrl;
  const authToken = databaseToken || tursoToken || undefined;
  if (configuredUrl) {
    const scheme = configuredUrl.split(":", 1)[0].toLowerCase();
    const isRemote = scheme === "libsql" || scheme === "https" || scheme === "wss" || scheme === "http" || scheme === "ws";
    if (isRemote && !authToken) {
      throw new Error("DATABASE_AUTH_TOKEN (or TURSO_AUTH_TOKEN) is required for a remote database URL.");
    }
    if (scheme === "file" && authToken) {
      throw new Error("Database auth tokens are only valid with a remote database URL.");
    }
    if (!isRemote && scheme !== "file") {
      throw new Error(`Unsupported DATABASE_URL scheme: ${scheme || "(missing)"}.`);
    }
    return { url: configuredUrl, authToken };
  }

  if (authToken) {
    throw new Error("A database auth token was set without DATABASE_URL or TURSO_DATABASE_URL.");
  }

  const localPath = path.resolve(process.cwd(), env.CAPI_DB_PATH?.trim() || "data/capi.sqlite");
  mkdirSync(path.dirname(localPath), { recursive: true, mode: 0o700 });
  return { url: pathToFileURL(localPath).href, localPath };
}
