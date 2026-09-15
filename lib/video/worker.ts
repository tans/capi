import type { RelayRegistry, VideoTask } from "../relay/store";
import type { Channel } from "../relay/types";

const WORKER_KEY = "__capi_video_worker_started__";

type WorkerGlobal = typeof globalThis & { [WORKER_KEY]?: boolean };
/** Starts one durable-process poller; SQLite makes it safe across restarts. */
export function startVideoTaskWorker(registry: RelayRegistry): void {
  const target = globalThis as WorkerGlobal;
  if (target[WORKER_KEY]) return;
  target[WORKER_KEY] = true;
  setInterval(() => void pollDueTasks(registry), 5000);
  void pollDueTasks(registry);
}

async function pollDueTasks(registry: RelayRegistry): Promise<void> {
  for (const task of registry.listDueVideoTasks()) await pollVideoTask(registry, task);
}

function headersFor(channel: Channel, key: string): Record<string, string> {
  const headers = Object.fromEntries(Object.entries(channel.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
  return { ...headers, authorization: headers.authorization ?? `Bearer ${key}` };
}

async function recordUsage(registry: RelayRegistry, task: VideoTask, success: boolean, statusCode: number): Promise<void> {
  const key = registry.getKey(task.keyId);
  const channel = task.channelId === null ? undefined : registry.getChannel(task.channelId);
  if (!key) return;
  await registry.recordUsage({ id: task.id, requestId: task.id, createdAt: Date.now(), keyId: task.keyId, keyName: key.name, channelId: task.channelId, channelName: channel?.name ?? "unknown", group: "default", model: task.model, requestModel: task.model, upstreamModel: channel?.modelMapping?.[task.model] ?? task.model, stream: false, promptTokens: 0, completionTokens: 0, cachedTokens: 0, quota: success ? task.quoteUnits : 0, retry: 0, firstByteMs: 0, durationMs: Date.now() - task.createdAt, success, statusCode, ...(task.error ? { errorMessage: task.error } : {}) });
}

/** Shared reconciliation used by both the worker and task GET endpoint. */
export async function pollVideoTask(registry: RelayRegistry, task: VideoTask): Promise<VideoTask> {
  if (!task.upstreamId) return registry.updateVideoTask(task.id, { state: "unknown", error: task.error ?? "upstream task id unavailable; manual reconciliation required", nextPollAt: null }) ?? task;
  const channel = task.channelId === null ? undefined : registry.getChannel(task.channelId);
  const key = channel ? task.upstreamKey ?? registry.pickUpstreamKey(channel) : undefined;
  if (!channel || !key) return registry.updateVideoTask(task.id, { state: "unknown", error: "video channel unavailable during reconciliation", nextPollAt: null }) ?? task;
  try {
    const statusPath = (channel.videoStatusPath ?? "/videos/{id}").replace("{id}", encodeURIComponent(task.upstreamId));
    const response = await fetch(`${channel.baseUrl.replace(/\/+$/, "")}${statusPath}`, { headers: headersFor(channel, key), signal: AbortSignal.timeout(registry.settings.requestTimeoutMs) });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) { const next = registry.updateVideoTask(task.id, { state: "unknown", error: typeof result.message === "string" ? result.message : `video status provider returned ${response.status}`, nextPollAt: null }) ?? task; await registry.finalizeBilling(task.id, 0, "unknown"); return next; }
    const status = typeof result.status === "string" ? result.status.toLowerCase() : "";
    const url = typeof result.video_url === "string" ? result.video_url : typeof result.url === "string" ? result.url : null;
    if (url || ["succeed", "succeeded", "completed", "success"].includes(status)) {
      if (task.quoteUnits === 0 || await registry.finalizeBilling(task.id, task.quoteUnits, "settled")) { const next = registry.updateVideoTask(task.id, { state: "succeeded", resultUrl: url, nextPollAt: null, error: null }) ?? task; await recordUsage(registry, next, true, response.status); return next; }
    } else if (["failed", "error", "canceled", "cancelled"].includes(status)) {
      await registry.finalizeBilling(task.id, 0, "released");
      const next = registry.updateVideoTask(task.id, { state: "failed", error: typeof result.message === "string" ? result.message : "video provider reported failure", nextPollAt: null }) ?? task; await recordUsage(registry, next, false, response.status); return next;
    } else return registry.updateVideoTask(task.id, { state: "running", nextPollAt: Date.now() + 5000 }) ?? task;
  } catch (error) {
    const next = registry.updateVideoTask(task.id, { state: "unknown", error: error instanceof Error ? error.message : "status unknown", nextPollAt: null }) ?? task; await registry.finalizeBilling(task.id, 0, "unknown"); return next;
  }
  return registry.getVideoTask(task.id) ?? task;
}
