import { authenticateKey, getRegistry } from "@/lib/relay";
import { pollVideoTask } from "@/lib/video/worker";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const registry = await getRegistry();
  const auth = (await authenticateKey(registry, request, "video.generate"));
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  let task = (await registry.getVideoTask(id));
  if (!task || task.workspaceId !== auth.apiKey.workspaceId) return Response.json({ error: { type: "invalid_request_error", code: "task_not_found", message: "Task not found." } }, { status: 404, headers: { "cache-control": "no-store" } });
  if ((task.state === "running" || task.state === "unknown") && task.upstreamId && (!task.nextPollAt || task.nextPollAt <= Date.now())) task = await pollVideoTask(registry, task);
  return Response.json({ id: task.id, object: "video.task", status: task.state, model: task.model, result: task.resultUrl ? { url: task.resultUrl } : null, error: task.error ? { message: task.error } : null, created_at: Math.floor(task.createdAt / 1000), updated_at: Math.floor(task.updatedAt / 1000) }, { headers: { "cache-control": "no-store" } });
}
