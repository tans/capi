import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AsyncSqliteQueryAdapter } from "../storage";

export const MAX_MEDIA_FILE_BYTES = 25 * 1024 * 1024;
export const MEDIA_FILE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DOWNLOAD_TTL_MS = 60 * 60 * 1000;
const ID_PATTERN = /^file_[a-f0-9]{36}$/;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav",
  "application/pdf",
]);

export type MediaFile = {
  id: string;
  workspaceId: number;
  keyId: number;
  filename: string;
  mimeType: string;
  byteSize: number;
  purpose: string;
  sha256: string;
  createdAt: number;
  expiresAt: number | null;
};

type FileRow = {
  id: string; workspace_id: number; key_id: number; filename: string; mime_type: string;
  byte_size: number; purpose: string; sha256: string; created_at: number; expires_at: number | null;
};

function fromRow(row: FileRow): MediaFile {
  return {
    id: row.id, workspaceId: row.workspace_id, keyId: row.key_id, filename: row.filename,
    mimeType: row.mime_type, byteSize: row.byte_size, purpose: row.purpose, sha256: row.sha256,
    createdAt: row.created_at, expiresAt: row.expires_at,
  };
}

function filesDirectory(): string {
  return path.resolve(process.cwd(), process.env.CAPI_FILES_DIR?.trim() || "data/files");
}

function filePath(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error("Invalid file ID.");
  return path.join(filesDirectory(), id);
}

function safeFilename(value: string): string {
  const basename = path.basename(value.replaceAll("\\", "/"));
  const cleaned = basename.replace(/[\u0000-\u001f\u007f]/g, "_").trim().slice(0, 240);
  return cleaned || "upload";
}

export function normalizeMediaType(value: string): string | null {
  const type = value.split(";", 1)[0]!.trim().toLowerCase();
  return ALLOWED_TYPES.has(type) ? type : null;
}

export async function createMediaFile(input: {
  db: AsyncSqliteQueryAdapter;
  workspaceId: number;
  keyId: number;
  filename: string;
  mimeType: string;
  purpose: string;
  bytes: Uint8Array;
}): Promise<MediaFile> {
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_MEDIA_FILE_BYTES) throw new Error("File size must be between 1 byte and 25 MiB.");
  const mimeType = normalizeMediaType(input.mimeType);
  if (!mimeType) throw new Error("Unsupported file type.");
  const now = Date.now();
  const id = `file_${randomBytes(18).toString("hex")}`;
  const bytes = Buffer.from(input.bytes);
  await mkdir(filesDirectory(), { recursive: true, mode: 0o700 });
  await writeFile(filePath(id), bytes, { flag: "wx", mode: 0o600 });
  try {
    await input.db.query(
      "INSERT INTO media_files (id, workspace_id, key_id, filename, mime_type, byte_size, purpose, sha256, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, input.workspaceId, input.keyId, safeFilename(input.filename), mimeType, bytes.byteLength, input.purpose, createHash("sha256").update(bytes).digest("hex"), now, now + MEDIA_FILE_TTL_MS);
  } catch (error) {
    await unlink(filePath(id)).catch(() => undefined);
    throw error;
  }
  return { id, workspaceId: input.workspaceId, keyId: input.keyId, filename: safeFilename(input.filename), mimeType, byteSize: bytes.byteLength, purpose: input.purpose, sha256: createHash("sha256").update(bytes).digest("hex"), createdAt: now, expiresAt: now + MEDIA_FILE_TTL_MS };
}

export async function getMediaFile(db: AsyncSqliteQueryAdapter, id: string, workspaceId?: number): Promise<MediaFile | null> {
  if (!ID_PATTERN.test(id)) return null;
  const row = workspaceId === undefined
    ? await db.query<FileRow, [string]>("SELECT * FROM media_files WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)").get(id, Date.now())
    : await db.query<FileRow, [string, number, number]>("SELECT * FROM media_files WHERE id = ? AND workspace_id = ? AND (expires_at IS NULL OR expires_at > ?)").get(id, workspaceId, Date.now());
  return row ? fromRow(row) : null;
}

export async function readMediaFile(file: MediaFile): Promise<Buffer> {
  const bytes = await readFile(filePath(file.id));
  if (bytes.byteLength !== file.byteSize || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
    throw new Error("Stored file failed integrity verification.");
  }
  return bytes;
}

export async function listMediaFiles(db: AsyncSqliteQueryAdapter, workspaceId: number, limit = 100, before?: number): Promise<MediaFile[]> {
  const rows = before === undefined
    ? await db.query<FileRow, [number, number]>("SELECT * FROM media_files WHERE workspace_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT ?").all(workspaceId, Date.now(), limit)
    : await db.query<FileRow, [number, number, number, number]>("SELECT * FROM media_files WHERE workspace_id = ? AND created_at < ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT ?").all(workspaceId, before, Date.now(), limit);
  return rows.map(fromRow);
}

export async function deleteMediaFile(db: AsyncSqliteQueryAdapter, id: string, workspaceId: number): Promise<boolean> {
  const file = await getMediaFile(db, id, workspaceId);
  if (!file) return false;
  const result = await db.query("DELETE FROM media_files WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  if (result.changes) await unlink(filePath(id)).catch(() => undefined);
  return result.changes > 0;
}

export async function createMediaFileDownloadUrl(db: AsyncSqliteQueryAdapter, file: MediaFile, requestUrl: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + DOWNLOAD_TTL_MS;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.query("INSERT INTO media_file_download_tokens (token_hash, file_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, file.id, expiresAt);
  await db.query("DELETE FROM media_file_download_tokens WHERE expires_at <= ?").run(Date.now());
  const configuredBase = process.env.CAPI_PUBLIC_URL?.trim();
  const base = configuredBase ? new URL(configuredBase) : new URL(new URL(requestUrl).origin);
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") throw new Error("CAPI_PUBLIC_URL must use HTTPS.");
  base.pathname = `${base.pathname.replace(/\/$/, "")}/api/v1/files/${encodeURIComponent(file.id)}/content`;
  base.search = new URLSearchParams({ token }).toString();
  base.hash = "";
  return base.toString();
}

export async function verifyMediaFileDownloadToken(db: AsyncSqliteQueryAdapter, id: string, token: string): Promise<MediaFile | null> {
  if (!ID_PATTERN.test(id) || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await db.query<{ file_id: string; expires_at: number }, [string, string, number, number]>(
    "SELECT t.file_id, t.expires_at FROM media_file_download_tokens t JOIN media_files f ON f.id = t.file_id WHERE t.token_hash = ? AND t.file_id = ? AND t.expires_at > ? AND (f.expires_at IS NULL OR f.expires_at > ?)",
  ).get(tokenHash, id, Date.now(), Date.now());
  return row ? getMediaFile(db, id) : null;
}

export function mediaFileResponse(file: MediaFile, bytes: Uint8Array, download = false): Response {
  const filename = encodeURIComponent(file.filename).replaceAll("'", "%27");
  const body = Buffer.from(bytes);
  const bodyBuffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return new Response(bodyBuffer, {
    headers: {
      "content-type": file.mimeType,
      "content-length": String(bytes.byteLength),
      "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${filename}`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}

export function toDataUrl(file: MediaFile, bytes: Uint8Array): string {
  return `data:${file.mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function resolveResponsesFileInputs(value: unknown, db: AsyncSqliteQueryAdapter, workspaceId: number): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => resolveResponsesFileInputs(item, db, workspaceId)));
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const fileId = typeof input.file_id === "string" && input.file_id.startsWith("file_") ? input.file_id : null;
  if (fileId) {
    const file = await getMediaFile(db, fileId, workspaceId);
    if (!file) throw new Error("Referenced CAPI file was not found in this workspace.");
    const bytes = await readMediaFile(file);
    const rest = { ...input };
    delete rest.file_id;
    if (input.type === "input_image" || file.mimeType.startsWith("image/")) {
      rest.image_url = toDataUrl(file, bytes);
    } else {
      rest.file_data = bytes.toString("base64");
      rest.filename = file.filename;
    }
    return rest;
  }
  const entries = await Promise.all(Object.entries(input).map(async ([key, item]) => [key, await resolveResponsesFileInputs(item, db, workspaceId)] as const));
  return Object.fromEntries(entries);
}
