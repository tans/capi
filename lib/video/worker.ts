import type { RelayRegistry, VideoTask } from "../relay/store";
import type { Channel } from "../relay/types";
import { buildVideoStatusEndpoint, readVideoPath } from "../relay/video-protocol";
import { createMediaFileFromResponse, fetchPublicMediaResponse, MAX_ARCHIVED_OUTPUT_BYTES } from "../relay/files";

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
  for (const task of (await registry.listDueVideoTasks())) await pollVideoTask(registry, task);
}

function headersFor(channel: Channel, key: string): Record<string, string> {
  const headers = Object.fromEntries(Object.entries(channel.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
  return { ...headers, authorization: headers.authorization ?? `Bearer ${key}` };
}

function videoHeadersFor(channel: Channel, key: string): Record<string, string> {
  const headers = headersFor(channel, key);
  const auth = channel.videoProtocolConfig?.auth;
  if (auth?.type === "api-key-header") {
    delete headers.authorization;
    headers[auth.header.toLowerCase()] = key;
  } else if (channel.videoProtocolConfig) {
    headers.authorization = `Bearer ${key}`;
  }
  return headers;
}

async function recordUsage(registry: RelayRegistry, task: VideoTask, success: boolean, statusCode: number, completionTokens = 0): Promise<void> {
  const key = (await registry.getKey(task.keyId));
  const channel = task.channelId === null ? undefined : (await registry.getChannel(task.channelId));
  if (!key) return;
  await registry.recordUsage({ id: task.id, requestId: task.id, createdAt: Date.now(), keyId: task.keyId, keyName: key.name, channelId: task.channelId, channelName: channel?.name ?? "unknown", group: "default", model: task.model, requestModel: task.model, upstreamModel: channel?.modelMapping?.[task.model] ?? task.model, stream: false, promptTokens: 0, completionTokens, cachedTokens: 0, quota: success ? task.quoteUnits : 0, retry: 0, firstByteMs: 0, durationMs: Date.now() - task.createdAt, success, statusCode, ...(task.error ? { errorMessage: task.error } : {}) });
}

function providerCompletionTokens(result: Record<string, unknown>): number {
  const value = readVideoPath(result, "usage.completion_tokens");
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

/** Shared reconciliation used by both the worker and task GET endpoint. */
export async function pollVideoTask(registry: RelayRegistry, task: VideoTask): Promise<VideoTask> {
  if (!task.upstreamId) return (await registry.updateVideoTask(task.id, { state: "unknown", error: task.error ?? "upstream task id unavailable; manual reconciliation required", nextPollAt: null })) ?? task;
  const channel = task.channelId === null ? undefined : (await registry.getChannel(task.channelId));
  const key = channel ? task.upstreamKey ?? registry.pickUpstreamKey(channel) : undefined;
  if (!channel || !key) return (await registry.updateVideoTask(task.id, { state: "unknown", error: "video channel unavailable during reconciliation", nextPollAt: null })) ?? task;
  try {
    const protocol = channel.videoProtocolConfig;
    const statusPath = protocol
      ? buildVideoStatusEndpoint(protocol, task.upstreamId)
      : (channel.videoStatusPath ?? "/videos/{id}").replace("{id}", encodeURIComponent(task.upstreamId));
    const response = await fetch(`${channel.baseUrl.replace(/\/+$/, "")}${statusPath}`, { headers: videoHeadersFor(channel, key), signal: AbortSignal.timeout((await registry.getSettings()).requestTimeoutMs) });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) { const next = (await registry.updateVideoTask(task.id, { state: "unknown", error: typeof result.message === "string" ? result.message : `video status provider returned ${response.status}`, nextPollAt: null })) ?? task; await registry.finalizeBilling(task.id, 0, "unknown"); return next; }
    const statusValue = protocol ? readVideoPath(result, protocol.poll.statusPath) : result.status;
    const status = typeof statusValue === "string" ? statusValue.toLowerCase() : "";
    const urlValue = protocol ? readVideoPath(result, protocol.poll.resultUrlPath) : typeof result.video_url === "string" ? result.video_url : result.url;
    const url = typeof urlValue === "string" && urlValue ? urlValue : null;
    const successStatuses = protocol?.poll.successStatuses?.map((value) => value.toLowerCase()) ?? ["succeed", "succeeded", "completed", "success"];
    const failureStatuses = protocol?.poll.failureStatuses?.map((value) => value.toLowerCase()) ?? ["failed", "error", "canceled", "cancelled"];
    if (url || (successStatuses.includes(status) && !protocol)) {
      let archivedResultUrl = url;
      if (url) {
        try {
          const media = await fetchPublicMediaResponse(url, MAX_ARCHIVED_OUTPUT_BYTES, "video/");
          const mimeType = media.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "video/mp4";
          const extension = mimeType === "video/webm" ? "webm" : "mp4";
          const file = await createMediaFileFromResponse({ db: registry.database, workspaceId: task.workspaceId, keyId: task.keyId, filename: `generated-${task.id}.${extension}`, mimeType, purpose: "generated_video", response: media, maxBytes: MAX_ARCHIVED_OUTPUT_BYTES, persistent: true });
          archivedResultUrl = `capi-file://${file.id}`;
        } catch (error) {
          console.warn("[video] output archive failed:", error instanceof Error ? error.message : "unknown error");
        }
      }
      if (task.quoteUnits === 0 || await registry.finalizeBilling(task.id, task.quoteUnits, "settled")) { const next = (await registry.updateVideoTask(task.id, { state: "succeeded", resultUrl: archivedResultUrl, nextPollAt: null, error: null })) ?? task; await recordUsage(registry, next, true, response.status, providerCompletionTokens(result)); return next; }
    } else if (failureStatuses.includes(status)) {
      await registry.finalizeBilling(task.id, 0, "released");
      const configuredError = protocol?.poll.errorPath ? readVideoPath(result, protocol.poll.errorPath) : undefined;
      const errorMessage = typeof configuredError === "string" ? configuredError : typeof result.message === "string" ? result.message : "video provider reported failure";
      const next = (await registry.updateVideoTask(task.id, { state: "failed", error: errorMessage, nextPollAt: null })) ?? task; await recordUsage(registry, next, false, response.status, providerCompletionTokens(result)); return next;
    } else return (await registry.updateVideoTask(task.id, { state: "running", nextPollAt: Date.now() + 5000 })) ?? task;
  } catch (error) {
    const next = (await registry.updateVideoTask(task.id, { state: "unknown", error: error instanceof Error ? error.message : "status unknown", nextPollAt: null })) ?? task; await registry.finalizeBilling(task.id, 0, "unknown"); return next;
  }
  return (await registry.getVideoTask(task.id)) ?? task;
}
