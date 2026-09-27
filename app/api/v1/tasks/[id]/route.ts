import { authenticateKey, getRegistry } from "@/lib/relay";
import { pollVideoTask } from "@/lib/video/worker";
import { createMediaFileDownloadUrl, getMediaFile } from "@/lib/relay/files";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const registry = await getRegistry();
  const auth = (await authenticateKey(registry, request, "video.generate"));
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  let task = (await registry.getVideoTask(id));
  if (!task || task.workspaceId !== auth.apiKey.workspaceId) return Response.json({ error: { type: "invalid_request_error", code: "task_not_found", message: "Task not found." } }, { status: 404, headers: { "cache-control": "no-store" } });
  if ((task.state === "running" || task.state === "unknown") && task.upstreamId && (!task.nextPollAt || task.nextPollAt <= Date.now())) task = await pollVideoTask(registry, task);
  let result: Record<string, unknown> | null = task.resultUrl ? { url: task.resultUrl, archived: false } : null;
  if (task.resultUrl?.startsWith("capi-file://")) {
    const fileId = task.resultUrl.slice("capi-file://".length);
    const file = await getMediaFile(registry.database, fileId, auth.apiKey.workspaceId);
    result = file ? {
      url: await createMediaFileDownloadUrl(registry.database, file, request.url),
      file_id: file.id,
      filename: file.filename,
      bytes: file.byteSize,
      content_type: file.mimeType,
      archived: true,
    } : { file_id: fileId, archived: false, unavailable: true };
  }
  return Response.json({ id: task.id, object: "video.task", status: task.state, model: task.model, result, error: task.error ? { message: task.error } : null, created_at: Math.floor(task.createdAt / 1000), updated_at: Math.floor(task.updatedAt / 1000) }, { headers: { "cache-control": "no-store" } });
}
