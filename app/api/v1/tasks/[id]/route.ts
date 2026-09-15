import { authenticateKey, getRegistry } from "@/lib/relay";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const registry = await getRegistry();
  const auth = authenticateKey(registry, request, "video.generate");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  let task = registry.getVideoTask(id);
  if (!task || task.workspaceId !== auth.apiKey.workspaceId) return Response.json({ error: { type: "invalid_request_error", code: "task_not_found", message: "Task not found." } }, { status: 404, headers: { "cache-control": "no-store" } });
  if ((task.state === "running" || task.state === "unknown") && task.upstreamId && (!task.nextPollAt || task.nextPollAt <= Date.now())) {
    const channel = task.channelId === null ? undefined : registry.getChannel(task.channelId);
    const key = channel ? task.upstreamKey ?? registry.pickUpstreamKey(channel) : undefined;
    if (channel && key) {
        const statusPath = (channel.videoStatusPath ?? "/videos/{id}").replace("{id}", encodeURIComponent(task.upstreamId));
      try {
        const upstream = await fetch(`${channel.baseUrl.replace(/\/+$/, "")}${statusPath}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(registry.settings.requestTimeoutMs) });
        const result = await upstream.json().catch(() => ({})) as Record<string, unknown>;
        const status = typeof result.status === "string" ? result.status.toLowerCase() : "";
        const url = typeof result.video_url === "string" ? result.video_url : typeof result.url === "string" ? result.url : null;
        if (url || ["succeed", "succeeded", "completed", "success"].includes(status)) {
          if (task.quoteUnits === 0 || await registry.finalizeBilling(task.id, task.quoteUnits, "settled")) {
            task = registry.updateVideoTask(task.id, { state: "succeeded", resultUrl: url, nextPollAt: null }) ?? task;
          } else task = registry.getVideoTask(task.id) ?? task;
        } else if (["failed", "error", "canceled", "cancelled"].includes(status)) {
          await registry.finalizeBilling(task.id, 0, "released");
          task = registry.updateVideoTask(task.id, { state: "failed", error: typeof result.message === "string" ? result.message : "upstream video generation failed", nextPollAt: null }) ?? task;
        } else {
          task = registry.updateVideoTask(task.id, { state: "running", nextPollAt: Date.now() + 5000 }) ?? task;
        }
      } catch (error) {
        task = registry.updateVideoTask(task.id, { state: "unknown", error: error instanceof Error ? error.message : "status unknown", nextPollAt: Date.now() + 15000 }) ?? task;
      }
    }
  }
  return Response.json({ id: task.id, object: "video.task", status: task.state, model: task.model, result: task.resultUrl ? { url: task.resultUrl } : null, error: task.error ? { message: task.error } : null, created_at: Math.floor(task.createdAt / 1000), updated_at: Math.floor(task.updatedAt / 1000) }, { headers: { "cache-control": "no-store" } });
}
