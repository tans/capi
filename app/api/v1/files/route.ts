import { assertOperationAllowed, authenticateKey, getRegistry } from "@/lib/relay";
import { createMediaFile, createMediaFileDownloadUrl, listMediaFiles, MAX_MEDIA_FILE_BYTES, normalizeMediaType } from "@/lib/relay/files";

const PURPOSES = new Set(["vision", "user_data", "input"]);

function serialize(file: Awaited<ReturnType<typeof createMediaFile>>, url?: string) {
  return {
    id: file.id,
    object: "file",
    bytes: file.byteSize,
    created_at: Math.floor(file.createdAt / 1000),
    expires_at: file.expiresAt ? Math.floor(file.expiresAt / 1000) : null,
    filename: file.filename,
    purpose: file.purpose,
    status: "processed",
    content_type: file.mimeType,
    ...(url ? { url } : {}),
  };
}

export async function POST(request: Request) {
  const registry = await getRegistry();
  const auth = await authenticateKey(registry, request, "files.write");
  if (!auth.ok) return auth.response;
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_FILE_BYTES + 128 * 1024) {
    return Response.json({ error: { type: "invalid_request_error", code: "file_too_large", message: "Files must be 25 MiB or smaller." } }, { status: 413 });
  }

  let form: FormData;
  try { form = await request.formData(); }
  catch { return Response.json({ error: { type: "invalid_request_error", code: "invalid_multipart", message: "Upload must use multipart/form-data." } }, { status: 400 }); }
  const entry = form.get("file");
  if (!entry || typeof entry === "string" || typeof entry.arrayBuffer !== "function") {
    return Response.json({ error: { type: "invalid_request_error", code: "missing_file", message: "A file field is required." } }, { status: 400 });
  }
  if (entry.size > MAX_MEDIA_FILE_BYTES) return Response.json({ error: { type: "invalid_request_error", code: "file_too_large", message: "Files must be 25 MiB or smaller." } }, { status: 413 });
  const purposeValue = form.get("purpose");
  const purpose = typeof purposeValue === "string" ? purposeValue : "vision";
  if (!PURPOSES.has(purpose)) return Response.json({ error: { type: "invalid_request_error", code: "invalid_purpose", message: "purpose must be vision, user_data, or input." } }, { status: 400 });
  const mimeType = normalizeMediaType(entry.type || "application/octet-stream");
  if (!mimeType) return Response.json({ error: { type: "invalid_request_error", code: "unsupported_file_type", message: "Supported types are common image, video, audio, and PDF files." } }, { status: 415 });

  try {
    const file = await createMediaFile({ db: registry.database, workspaceId: auth.apiKey.workspaceId, keyId: auth.apiKey.id, filename: entry.name, mimeType, purpose, bytes: new Uint8Array(await entry.arrayBuffer()) });
    const url = await createMediaFileDownloadUrl(registry.database, file, request.url);
    return Response.json(serialize(file, url), { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: { type: "api_error", code: "file_upload_failed", message: error instanceof Error ? error.message : "File upload failed." } }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const registry = await getRegistry();
  const auth = await authenticateKey(registry, request, "files.write");
  if (!auth.ok) return auth.response;
  assertOperationAllowed(auth.apiKey, "files.write");
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 100;
  const beforeValue = Number(url.searchParams.get("before"));
  const files = await listMediaFiles(registry.database, auth.apiKey.workspaceId, limit, Number.isSafeInteger(beforeValue) && beforeValue > 0 ? beforeValue : undefined);
  return Response.json({ object: "list", data: files.map((file) => serialize(file)), has_more: files.length === limit }, { headers: { "cache-control": "no-store" } });
}
