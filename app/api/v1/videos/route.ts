import { assertModelAllowed, authenticateKey, estimateVideoPreConsumeQuota, getRegistry, selectChannel } from "@/lib/relay";
import { buildVideoSubmit, readVideoPath } from "@/lib/relay/video-protocol";
import type { Channel } from "@/lib/relay/types";

function requestedVideoDuration(body: Record<string, unknown>, channel: Pick<Channel, "videoProtocolConfig">): number {
  for (const field of ["duration_seconds", "duration", "seconds"]) {
    const value = body[field];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  for (const mapping of Object.values(channel.videoProtocolConfig?.submit.request ?? {})) {
    if (!mapping || typeof mapping !== "object" || !("from" in mapping)) continue;
    if (!["duration_seconds", "duration", "seconds"].includes(String(mapping.from))) continue;
    const fallback = "default" in mapping ? mapping.default : undefined;
    if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) return fallback;
  }
  return 5;
}

/** Provider-neutral asynchronous video submission endpoint. */
export async function POST(request: Request) {
  const registry = await getRegistry();
  const auth = (await authenticateKey(registry, request, "video.generate"));
  if (!auth.ok) return auth.response;
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) return Response.json({ error: { type: "invalid_request_error", code: "missing_idempotency_key", message: "Idempotency-Key is required." } }, { status: 400 });
  const taskId = `video_${auth.apiKey.workspaceId}_${idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)}`;
  const existing = (await registry.getVideoTask(taskId));
  if (existing && existing.workspaceId === auth.apiKey.workspaceId) return Response.json({ id: existing.id, object: "video.task", status: existing.state }, { status: 200 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: { type: "invalid_request_error", message: "Body must be JSON." } }, { status: 400 }); }
  const model = typeof body.model === "string" ? body.model : "";
  if (!model || typeof body.prompt !== "string" || body.prompt.length === 0) return Response.json({ error: { type: "invalid_request_error", code: "invalid_request", message: "model and prompt are required." } }, { status: 400 });
  try { assertModelAllowed(auth.apiKey, model); } catch (error) { return Response.json({ error: { type: "permission_error", code: "model_not_found", message: error instanceof Error ? error.message : "Model is not allowed." } }, { status: 403 }); }
  let channel = (await selectChannel(registry, { group: "default", model, retry: 0, excludeIds: [], workspaceId: auth.apiKey.workspaceId, allowPlatform: (await registry.workspaceAllowsPlatformChannels(auth.apiKey.workspaceId)) }))?.channel;
  if (!channel) return Response.json({ error: { type: "api_error", code: "no_available_channel", message: "No available channel for this model." } }, { status: 503 });
  const missingInput = channel.videoProtocolConfig?.requiredInput?.find((path) => {
    const value = readVideoPath(body, path);
    return value === undefined || value === null || value === "";
  });
  if (missingInput) return Response.json({ error: { type: "invalid_request_error", code: "invalid_request", message: `The selected provider requires ${missingInput}.` } }, { status: 400 });
  const durationSeconds = requestedVideoDuration(body, channel);
  const quote = estimateVideoPreConsumeQuota((await registry.getSettings()), model, durationSeconds, "default", "default");
  // Admission and task creation are one immediate SQLite transaction.
  let isBillable = channel.ownerType === "platform" && !quote.free;
  if (isBillable && !await registry.reserveBilling(taskId, auth.apiKey.workspaceId, auth.apiKey.id, quote.quota)) {
    channel = (await selectChannel(registry, { group: "default", model, retry: 0, excludeIds: [channel.id], workspaceId: auth.apiKey.workspaceId, allowPlatform: false }))?.channel;
    if (!channel) return Response.json({ error: { type: "quota_error", code: "quota_exceeded", message: "Insufficient funds or key budget for platform video." } }, { status: 429 });
    isBillable = false;
  }
  const now = Date.now();
  if (!await registry.createVideoTaskIfCapacity({ id: taskId, workspaceId: auth.apiKey.workspaceId, keyId: auth.apiKey.id, channelId: channel.id, upstreamId: null, upstreamKey: null, model, request: body, quoteUnits: isBillable ? quote.quota : 0, state: "submitting", resultUrl: null, error: null, nextPollAt: null, createdAt: now, updatedAt: now })) {
    if (isBillable) await registry.finalizeBilling(taskId, 0, "released");
    return Response.json({ error: { type: "quota_error", code: "video_concurrency_exceeded", message: "This workspace already has the maximum number of active video tasks." } }, { status: 429 });
  }
  try {
    const key = registry.pickUpstreamKey(channel);
    if (!key) { (await registry.updateVideoTask(taskId, { state: "failed", error: "video channel has no upstream key", nextPollAt: null })); if (isBillable) await registry.finalizeBilling(taskId, 0, "released"); }
    else {
      const protocol = channel.videoProtocolConfig ?? undefined;
      const upstreamModel = channel.modelMapping?.[model] ?? model;
      const mapped = protocol ? buildVideoSubmit(protocol, { ...body, model: upstreamModel }) : null;
      const headers = Object.fromEntries(Object.entries(channel.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
      if (protocol?.auth?.type === "api-key-header") {
        delete headers.authorization;
        headers[protocol.auth.header.toLowerCase()] = key;
      } else {
        headers.authorization = protocol ? `Bearer ${key}` : headers.authorization ?? `Bearer ${key}`;
      }
      const upstream = await fetch(`${channel.baseUrl.replace(/\/+$/, "")}${mapped?.endpoint ?? channel.videoSubmitPath ?? "/videos"}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(mapped ? { ...mapped.body, ...Object(channel.paramOverride ?? {}) } : { ...body, model: upstreamModel, ...channel.paramOverride }),
        signal: AbortSignal.timeout((await registry.getSettings()).requestTimeoutMs),
      });
      const result = await upstream.json().catch(() => ({})) as Record<string, unknown>;
      if (!upstream.ok) { (await registry.updateVideoTask(taskId, { state: "failed", error: typeof result.message === "string" ? result.message : `video provider returned ${upstream.status}`, nextPollAt: null })); if (isBillable) await registry.finalizeBilling(taskId, 0, "released"); }
      else {
        const mappedId = protocol ? readVideoPath(result, protocol.taskIdPath) : undefined;
        const upstreamId = typeof mappedId === "string" ? mappedId : typeof result.task_id === "string" ? result.task_id : typeof result.id === "string" ? result.id : null;
        if (!upstreamId) { (await registry.updateVideoTask(taskId, { state: "unknown", error: "video provider accepted submission without a task id; manual reconciliation required", nextPollAt: null })); if (isBillable) await registry.finalizeBilling(taskId, 0, "unknown"); }
        else (await registry.updateVideoTask(taskId, { upstreamId, upstreamKey: key, state: "running", nextPollAt: Date.now() + 5000 }));
      }
    }
  } catch (error) {
    (await registry.updateVideoTask(taskId, { state: "unknown", error: error instanceof Error ? error.message : "submission status unknown", nextPollAt: Date.now() + 15000 }));
  }
  const task = (await registry.getVideoTask(taskId))!;
  return Response.json({ id: task.id, object: "video.task", status: task.state }, { status: 202 });
}
