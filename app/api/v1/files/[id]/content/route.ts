import { authenticateKey, getRegistry } from "@/lib/relay";
import { getMediaFile, mediaFileResponse, readMediaFile, verifyMediaFileDownloadToken } from "@/lib/relay/files";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const registry = await getRegistry();
  const { id } = await context.params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  let file = token ? await verifyMediaFileDownloadToken(registry.database, id, token) : null;
  let download = url.searchParams.get("download") === "1";
  if (!file) {
    const auth = await authenticateKey(registry, request, "files.write");
    if (!auth.ok) return auth.response;
    file = await getMediaFile(registry.database, id, auth.apiKey.workspaceId);
    if (!file) return Response.json({ error: { type: "invalid_request_error", code: "file_not_found", message: "File not found." } }, { status: 404 });
  }
  try { return mediaFileResponse(file, await readMediaFile(file), download); }
  catch { return Response.json({ error: { type: "api_error", code: "file_unavailable", message: "Stored file is unavailable." } }, { status: 500 }); }
}
