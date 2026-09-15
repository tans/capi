import type { RelayRegistry, VideoTask } from "../relay/store";

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
  for (const task of registry.listDueVideoTasks()) await pollTask(registry, task);
}

async function pollTask(registry: RelayRegistry, task: VideoTask): Promise<void> {
  const channel = task.channelId === null ? undefined : registry.getChannel(task.channelId);
  const key = channel ? task.upstreamKey ?? registry.pickUpstreamKey(channel) : undefined;
  if (!channel || !key || !task.upstreamId) {
    registry.updateVideoTask(task.id, { state: "unknown", error: "video channel unavailable during reconciliation", nextPollAt: Date.now() + 15000 });
    return;
  }
  try {
    const path = (channel.videoStatusPath ?? "/videos/{id}").replace("{id}", encodeURIComponent(task.upstreamId));
    const response = await fetch(`${channel.baseUrl.replace(/\/+$/, "")}${path}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(registry.settings.requestTimeoutMs) });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    const status = typeof result.status === "string" ? result.status.toLowerCase() : "";
    const url = typeof result.video_url === "string" ? result.video_url : typeof result.url === "string" ? result.url : null;
    if (url || ["succeed", "succeeded", "completed", "success"].includes(status)) {
      if (task.quoteUnits === 0 || await registry.finalizeBilling(task.id, task.quoteUnits, "settled")) registry.updateVideoTask(task.id, { state: "succeeded", resultUrl: url, nextPollAt: null, error: null });
    } else if (["failed", "error", "canceled", "cancelled"].includes(status)) {
      await registry.finalizeBilling(task.id, 0, "released");
      registry.updateVideoTask(task.id, { state: "failed", error: typeof result.message === "string" ? result.message : "video provider reported failure", nextPollAt: null });
    } else {
      registry.updateVideoTask(task.id, { state: "running", nextPollAt: Date.now() + 5000 });
    }
  } catch (error) {
    registry.updateVideoTask(task.id, { state: "unknown", error: error instanceof Error ? error.message : "status unknown", nextPollAt: Date.now() + 15000 });
  }
}
