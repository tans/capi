/**
 * In-memory mock of the Capi API.
 *
 * This exists so the HTTP surface documented in /docs/api is actually
 * reachable: requests validate a bearer token, tasks move through a real
 * lifecycle, and responses match the shapes shown in the reference. No
 * upstream provider is called.
 */

export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export type MockTask = {
  id: string;
  model: string;
  status: TaskStatus;
  createdAt: number;
  /** How long the fake generation takes before reaching a terminal state. */
  completesAfterMs: number;
  outputUrl: string;
  cost: { amount: number; currency: "USD" };
};

const tasks = new Map<string, MockTask>();

/** Fixed input so the mock is reproducible across requests. */
const TOKEN = "YOUR_API_TOKEN";

export function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return false;
  // Accept any non-empty token so the demo works with a real-looking key.
  return Boolean(value && value.length > 4);
}

export function unauthorized() {
  return Response.json(
    {
      error: {
        type: "authentication_error",
        code: "invalid_api_key",
        message:
          "Missing or malformed credentials. Send the key as `Authorization: Bearer YOUR_API_TOKEN`.",
      },
    },
    { status: 401 },
  );
}

export function badRequest(message: string, param?: string) {
  return Response.json(
    {
      error: {
        type: "invalid_request_error",
        code: param ? `invalid_${param}` : "invalid_request",
        message,
        param: param ?? null,
      },
    },
    { status: 400 },
  );
}

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

export function createTask(
  model: string,
  options: {
    /** Video and music tasks take longer than images. */
    kind?: "image" | "video" | "music" | "audio";
    output?: string;
    cost?: number;
  } = {},
): MockTask {
  const kind = options.kind ?? "video";
  const completesAfterMs =
    kind === "video" ? 7000 : kind === "music" ? 9000 : 3500;

  const task: MockTask = {
    id: randomId("tsk"),
    model,
    status: "pending",
    createdAt: Date.now(),
    completesAfterMs,
    outputUrl:
      options.output ??
      `https://file.capi.ai/${kind}/${randomId("out")}.${
        kind === "image" ? "png" : kind === "music" || kind === "audio" ? "mp3" : "mp4"
      }`,
    cost: { amount: options.cost ?? 0.21, currency: "USD" },
  };

  tasks.set(task.id, task);
  return task;
}

/** Advance a task's status based on elapsed wall-clock time. */
export function resolveTask(task: MockTask): MockTask {
  const elapsed = Date.now() - task.createdAt;

  if (elapsed >= task.completesAfterMs) {
    return { ...task, status: "completed" };
  }
  if (elapsed >= task.completesAfterMs * 0.35) {
    return { ...task, status: "processing" };
  }
  return { ...task, status: "pending" };
}

export function getTask(id: string): MockTask | undefined {
  const task = tasks.get(id);
  if (!task) return undefined;
  const resolved = resolveTask(task);
  tasks.set(id, resolved);
  return resolved;
}

export function serializeTask(task: MockTask) {
  const base = {
    task_id: task.id,
    id: task.id,
    model: task.model,
    status: task.status,
    created_at: new Date(task.createdAt).toISOString(),
  };

  if (task.status === "completed") {
    return {
      ...base,
      output: { url: task.outputUrl },
      // Mirrors the reference shape: media endpoints return typed keys too.
      videos: [{ url: task.outputUrl }],
      data: [{ url: task.outputUrl }],
      audio_url: task.outputUrl,
      cost: task.cost,
    };
  }

  if (task.status === "failed") {
    return {
      ...base,
      error: {
        code: "provider_unavailable",
        message:
          "The upstream provider returned an error after retries. The reserved credit was released.",
      },
      cost: { amount: 0, currency: "USD" as const },
    };
  }

  return base;
}

/** Canned completion text, varied by a hash of the prompt so it feels alive. */
export function mockCompletion(prompt: string) {
  const options = [
    "Here's a concise take: the request maps onto a queue-plus-worker pattern. Producers enqueue work items, workers pull them, and a broker handles retries and backpressure. The main design choice is whether delivery is at-least-once with idempotent handlers, or exactly-once with a transactional outbox.",
    "Short answer: yes — this is a good fit for an async task model. Submit the job, return an ID immediately, and let the client poll or receive a callback. That keeps your HTTP layer stateless and makes retries unambiguous.",
    "The tradeoff is latency versus cost. A smaller model answers in a few hundred milliseconds for a fraction of the price, while the frontier model is worth it when the task needs multi-step reasoning or long context.",
  ];

  let hash = 0;
  for (let i = 0; i < prompt.length; i += 1) {
    hash = (hash * 31 + prompt.charCodeAt(i)) % 997;
  }
  return options[hash % options.length];
}

export { TOKEN };
