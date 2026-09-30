#!/usr/bin/env bun

import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveStorageConfig } from "../lib/storage/config";

const storage = resolveStorageConfig();
if (!storage.localPath) {
  console.error("CAPI backup: remote libSQL/Turso is configured. Use the provider's native backup/restore feature.");
  process.exit(2);
}

const backupRoot = path.resolve(process.cwd(), process.env.CAPI_BACKUP_DIR?.trim() || "backups");
const filesDir = path.resolve(process.cwd(), process.env.CAPI_FILES_DIR?.trim() || "data/files");
const retention = Math.max(1, Number.parseInt(process.env.CAPI_BACKUP_RETENTION || "14", 10) || 14);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(backupRoot, stamp);
const databaseBackup = path.join(destination, "capi.sqlite");

await mkdir(destination, { recursive: true });

const proc = Bun.spawn(["sqlite3", storage.localPath, `.backup '${databaseBackup.replaceAll("'", "''")}'`], {
  stdout: "inherit",
  stderr: "inherit",
});
const exitCode = await proc.exited;
if (exitCode !== 0) {
  console.error("CAPI backup: sqlite3 backup failed. Install the sqlite3 CLI on the production host.");
  process.exit(exitCode);
}

try {
  await cp(filesDir, path.join(destination, "files"), { recursive: true, force: false });
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code !== "ENOENT") throw error;
}

await writeFile(
  path.join(destination, "manifest.json"),
  JSON.stringify({
    created_at: new Date().toISOString(),
    database: path.basename(databaseBackup),
    files: "files",
    source_database: storage.localPath,
  }, null, 2) + "\n",
);

const entries = (await readdir(backupRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .reverse();

for (const stale of entries.slice(retention)) {
  await rm(path.join(backupRoot, stale), { recursive: true, force: true });
}

console.log(`CAPI backup complete: ${destination}`);
