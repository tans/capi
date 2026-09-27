import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { Readable } from "node:stream";

import type { AsyncSqliteQueryAdapter } from "../storage";

export const MAX_MEDIA_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_ARCHIVED_OUTPUT_BYTES = 512 * 1024 * 1024;
export const MEDIA_FILE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DOWNLOAD_TTL_MS = 60 * 60 * 1000;
const ID_PATTERN = /^file_[a-f0-9]{36}$/;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav",
  "application/pdf",
]);

export class PayloadTooLargeError extends Error {
  constructor() { super("Request body exceeds the configured size limit."); }
}

export async function readRequestBytesLimited(request: Request, maxBytes: number): Promise<Buffer> {
  if (!request.body) throw new Error("Upload body is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export async function parseMultipartFormData(request: Request, maxBytes: number): Promise<FormData> {
  const body = await readRequestBytesLimited(request, maxBytes);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  const formBody = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return new Request(request.url, { method: "POST", headers, body: formBody }).formData();
}

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
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.CAPI_FILES_DIR?.trim() || "data/files");
}

function filePath(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error("Invalid file ID.");
  return path.join(/*turbopackIgnore: true*/ filesDirectory(), id);
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

async function assertPublicHttpsUrl(value: string): Promise<URL> {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Output URL is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Media URLs must use HTTPS on the default port.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("Media URL resolves to a non-public address.");
  return url;
}

export async function fetchPublicMediaResponse(value: string, maxBytes: number, typePrefix: "image/" | "video/"): Promise<Response> {
  let url = value;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const validated = await assertPublicHttpsUrl(url);
    const response = await fetch(validated, { redirect: "manual", signal: AbortSignal.timeout(5 * 60_000), headers: { accept: `${typePrefix}*` } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === 3) throw new Error("Media URL exceeded the redirect limit.");
      const location = response.headers.get("location");
      if (!location) throw new Error("Media URL redirect did not include a location.");
      url = new URL(location, validated).toString();
      await response.body?.cancel().catch(() => undefined);
      continue;
    }
    if (!response.ok) throw new Error(`Media URL returned ${response.status}.`);
    const mimeType = normalizeMediaType(response.headers.get("content-type") ?? "");
    if (!mimeType?.startsWith(typePrefix)) throw new Error(`Media URL did not return a supported ${typePrefix.slice(0, -1)} file.`);
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) throw new Error(`Media output exceeds ${Math.floor(maxBytes / 1024 / 1024)} MiB.`);
    return response;
  }
  throw new Error("Media URL could not be resolved.");
}

function isPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%", 1)[0]!;
  if (isIP(normalized) === 4) {
    const octets = normalized.split(".").map(Number);
    const [a, b] = octets;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19)));
  }
  if (isIP(normalized) === 6) {
    if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized.startsWith("ff")) return false;
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPublicAddress(mapped[1]!) : true;
  }
  return false;
}

/** Resolve an image URL for native image-edit providers with SSRF and size guards. */
export async function readImageReference(value: string, db: AsyncSqliteQueryAdapter, workspaceId: number): Promise<{ image: Buffer; mimeType: string; filename: string }> {
  const file = await getMediaFile(db, value, workspaceId);
  if (file) {
    if (!file.mimeType.startsWith("image/")) throw new Error("Referenced file is not an image.");
    return { image: await readMediaFile(file), mimeType: file.mimeType, filename: file.filename };
  }
  const dataUrl = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (dataUrl) {
    const image = Buffer.from(dataUrl[2]!, "base64");
    if (!image.byteLength || image.byteLength > MAX_MEDIA_FILE_BYTES) throw new Error("Reference image must be between 1 byte and 25 MiB.");
    return { image, mimeType: dataUrl[1]!, filename: `reference.${dataUrl[1]!.split("/")[1]}` };
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Image reference must be a file ID, data URL, or HTTPS URL."); }
  const response = await fetchPublicMediaResponse(url.toString(), MAX_MEDIA_FILE_BYTES, "image/");
  const mimeType = normalizeMediaType(response.headers.get("content-type") ?? "");
  if (!mimeType?.startsWith("image/")) throw new Error("Image reference URL did not return a supported image.");
  if (!response.body) throw new Error("Image reference response had no content.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MEDIA_FILE_BYTES) {
      await reader.cancel();
      throw new Error("Reference image must be 25 MiB or smaller.");
    }
    chunks.push(value);
  }
  if (!total) throw new Error("Reference image must not be empty.");
  return { image: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))), mimeType, filename: path.basename(url.pathname) || `reference.${mimeType.split("/")[1]}` };
}

export async function createMediaFile(input: {
  db: AsyncSqliteQueryAdapter;
  workspaceId: number;
  keyId: number;
  filename: string;
  mimeType: string;
  purpose: string;
  bytes: Uint8Array;
  maxBytes?: number;
  persistent?: boolean;
}): Promise<MediaFile> {
  await pruneExpiredMediaFiles(input.db);
  const maxBytes = input.maxBytes ?? MAX_MEDIA_FILE_BYTES;
  if (!input.bytes.byteLength || input.bytes.byteLength > maxBytes) throw new Error(`File size must be between 1 byte and ${Math.floor(maxBytes / 1024 / 1024)} MiB.`);
  const mimeType = normalizeMediaType(input.mimeType);
  if (!mimeType) throw new Error("Unsupported file type.");
  const now = Date.now();
  const expiresAt = input.persistent ? null : now + MEDIA_FILE_TTL_MS;
  const id = `file_${randomBytes(18).toString("hex")}`;
  const bytes = Buffer.from(input.bytes);
  await mkdir(filesDirectory(), { recursive: true, mode: 0o700 });
  await writeFile(filePath(id), bytes, { flag: "wx", mode: 0o600 });
  try {
    await input.db.query(
      "INSERT INTO media_files (id, workspace_id, key_id, filename, mime_type, byte_size, purpose, sha256, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, input.workspaceId, input.keyId, safeFilename(input.filename), mimeType, bytes.byteLength, input.purpose, createHash("sha256").update(bytes).digest("hex"), now, expiresAt);
  } catch (error) {
    await unlink(filePath(id)).catch(() => undefined);
    throw error;
  }
  return { id, workspaceId: input.workspaceId, keyId: input.keyId, filename: safeFilename(input.filename), mimeType, byteSize: bytes.byteLength, purpose: input.purpose, sha256: createHash("sha256").update(bytes).digest("hex"), createdAt: now, expiresAt };
}

export async function createMediaFileFromResponse(input: {
  db: AsyncSqliteQueryAdapter;
  workspaceId: number;
  keyId: number;
  filename: string;
  mimeType: string;
  purpose: string;
  response: Response;
  maxBytes?: number;
  persistent?: boolean;
}): Promise<MediaFile> {
  await pruneExpiredMediaFiles(input.db);
  const mimeType = normalizeMediaType(input.mimeType);
  if (!mimeType) throw new Error("Unsupported file type.");
  const maxBytes = input.maxBytes ?? MAX_ARCHIVED_OUTPUT_BYTES;
  const now = Date.now();
  const expiresAt = input.persistent ? null : now + MEDIA_FILE_TTL_MS;
  const id = `file_${randomBytes(18).toString("hex")}`;
  const finalPath = filePath(id);
  const tempPath = path.join(filesDirectory(), `${id}.tmp`);
  await mkdir(filesDirectory(), { recursive: true, mode: 0o700 });
  const handle = await open(tempPath, "wx", 0o600);
  const hash = createHash("sha256");
  let byteSize = 0;
  try {
    if (!input.response.body) throw new Error("Media output had no content.");
    for await (const chunk of input.response.body) {
      const bytes = Buffer.from(chunk as Uint8Array);
      byteSize += bytes.byteLength;
      if (byteSize > maxBytes) throw new Error(`Media output exceeds ${Math.floor(maxBytes / 1024 / 1024)} MiB.`);
      hash.update(bytes);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset);
        if (!bytesWritten) throw new Error("Could not write archived media output.");
        offset += bytesWritten;
      }
    }
    if (!byteSize) throw new Error("Media output was empty.");
    await handle.sync();
    await handle.close();
    await rename(tempPath, finalPath);
    const safeName = safeFilename(input.filename);
    const sha256 = hash.digest("hex");
    try {
      await input.db.query(
        "INSERT INTO media_files (id, workspace_id, key_id, filename, mime_type, byte_size, purpose, sha256, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, input.workspaceId, input.keyId, safeName, mimeType, byteSize, input.purpose, sha256, now, expiresAt);
    } catch (error) {
      await unlink(finalPath).catch(() => undefined);
      throw error;
    }
    return { id, workspaceId: input.workspaceId, keyId: input.keyId, filename: safeName, mimeType, byteSize, purpose: input.purpose, sha256, createdAt: now, expiresAt };
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
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

export async function listMediaFiles(db: AsyncSqliteQueryAdapter, workspaceId: number, limit = 100, before?: number, beforeId?: string): Promise<MediaFile[]> {
  await pruneExpiredMediaFiles(db);
  const rows = before === undefined
    ? await db.query<FileRow, [number, number, number]>("SELECT * FROM media_files WHERE workspace_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC, id DESC LIMIT ?").all(workspaceId, Date.now(), limit)
    : beforeId
      ? await db.query<FileRow, [number, number, number, string, number, number]>("SELECT * FROM media_files WHERE workspace_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC, id DESC LIMIT ?").all(workspaceId, before, before, beforeId, Date.now(), limit)
      : await db.query<FileRow, [number, number, number, number]>("SELECT * FROM media_files WHERE workspace_id = ? AND created_at < ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC, id DESC LIMIT ?").all(workspaceId, before, Date.now(), limit);
  return rows.map(fromRow);
}

export async function pruneExpiredMediaFiles(db: AsyncSqliteQueryAdapter): Promise<void> {
  await db.query(
    "UPDATE media_files SET expires_at = created_at + ? WHERE expires_at IS NULL AND purpose IN ('generated_image', 'generated_video')",
  ).run(MEDIA_FILE_TTL_MS);
  const expired = await db.query<{ id: string }, [number]>("SELECT id FROM media_files WHERE expires_at IS NOT NULL AND expires_at <= ?").all(Date.now());
  if (!expired.length) return;
  await db.query("DELETE FROM media_files WHERE expires_at IS NOT NULL AND expires_at <= ?").run(Date.now());
  await Promise.all(expired.map(({ id }) => unlink(filePath(id)).catch(() => undefined)));
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

export async function mediaFileStreamResponse(file: MediaFile, download = false, rangeHeader?: string | null): Promise<Response> {
  const info = await stat(filePath(file.id));
  if (info.size !== file.byteSize) throw new Error("Stored file size does not match its metadata.");
  const filename = encodeURIComponent(file.filename).replaceAll("'", "%27");
  let start = 0;
  let end = file.byteSize - 1;
  let status = 200;
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "content-range": `bytes */${file.byteSize}`, "accept-ranges": "bytes" } });
    if (!match[1]) start = Math.max(0, file.byteSize - Number(match[2]));
    else start = Number(match[1]);
    if (match[1] && match[2]) end = Number(match[2]);
    if (start > end || start >= file.byteSize || end < 0) return new Response(null, { status: 416, headers: { "content-range": `bytes */${file.byteSize}`, "accept-ranges": "bytes" } });
    end = Math.min(end, file.byteSize - 1);
    status = 206;
  }
  const stream = Readable.toWeb(createReadStream(filePath(file.id), { start, end })) as unknown as ReadableStream<Uint8Array>;
  return new Response(stream, { status, headers: {
    "content-type": file.mimeType,
    "content-length": String(end - start + 1),
    "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${filename}`,
    "cache-control": "private, max-age=300",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
    ...(status === 206 ? { "content-range": `bytes ${start}-${end}/${file.byteSize}` } : {}),
  } });
}

export function toDataUrl(file: MediaFile, bytes: Uint8Array): string {
  return `data:${file.mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function resolveResponsesFileInputs(value: unknown, db: AsyncSqliteQueryAdapter, workspaceId: number): Promise<unknown> {
  const budget = { remaining: MAX_MEDIA_FILE_BYTES };
  const resolve = async (inputValue: unknown): Promise<unknown> => {
    if (Array.isArray(inputValue)) {
      const result: unknown[] = [];
      for (const item of inputValue) result.push(await resolve(item));
      return result;
    }
    if (!inputValue || typeof inputValue !== "object") return inputValue;
    const input = inputValue as Record<string, unknown>;
    const fileId = typeof input.file_id === "string" && ID_PATTERN.test(input.file_id) ? input.file_id : null;
    if (fileId) {
      const file = await getMediaFile(db, fileId, workspaceId);
      if (!file) throw new Error("Referenced CAPI file was not found in this workspace.");
      if (file.byteSize > budget.remaining) throw new Error("Combined referenced CAPI files must not exceed 25 MiB.");
      budget.remaining -= file.byteSize;
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
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input)) result[key] = await resolve(item);
    return result;
  };
  return resolve(value);
}
