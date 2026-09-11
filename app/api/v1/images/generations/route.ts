import {
  badRequest,
  createTask,
  isAuthorized,
  serializeTask,
  unauthorized,
} from "@/lib/mock-api";

/** Image generations. Returns synchronously, matching the documented shape. */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  let body: {
    model?: string;
    prompt?: string;
    size?: string;
    quality?: string;
    n?: number;
  };

  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON.");
  }

  if (!body.model) return badRequest("Missing required parameter: model.", "model");
  if (!body.prompt) {
    return badRequest("Missing required parameter: prompt.", "prompt");
  }

  const n = Math.min(Math.max(body.n ?? 1, 1), 4);
  const seed = Math.random().toString(16).slice(2, 10);

  const task = createTask(body.model, {
    kind: "image",
    cost: 0.03 * n,
  });

  return Response.json({
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    size: body.size ?? "1024x1024",
    quality: body.quality ?? "medium",
    data: Array.from({ length: n }, (_, i) => ({
      url: `https://file.capi.ai/images/${seed}-${i + 1}.png`,
      revised_prompt: body.prompt,
    })),
    task_id: serializeTask(task).id,
    cost: { amount: 0.03 * n, currency: "USD" },
  });
}
