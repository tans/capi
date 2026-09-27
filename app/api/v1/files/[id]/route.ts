import { assertOperationAllowed, authenticateKey, getRegistry } from "@/lib/relay";
import { deleteMediaFile, getMediaFile, createMediaFileDownloadUrl } from "@/lib/relay/files";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const registry = await getRegistry();
  const auth = await authenticateKey(registry, request, "files.write");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const file = await getMediaFile(registry.database, id, auth.apiKey.workspaceId);
  if (!file) return Response.json({ error: { type: "invalid_request_error", code: "file_not_found", message: "File not found." } }, { status: 404 });
  const url = await createMediaFileDownloadUrl(registry.database, file, request.url);
  return Response.json({ ...file, object: "file", url }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const registry = await getRegistry();
  const auth = await authenticateKey(registry, request, "files.write");
  if (!auth.ok) return auth.response;
  assertOperationAllowed(auth.apiKey, "files.write");
  const { id } = await context.params;
  if (!await deleteMediaFile(registry.database, id, auth.apiKey.workspaceId)) {
    return Response.json({ error: { type: "invalid_request_error", code: "file_not_found", message: "File not found." } }, { status: 404 });
  }
  return Response.json({ id, object: "file", deleted: true });
}
