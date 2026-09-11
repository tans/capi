import {
  badRequest,
  createTask,
  isAuthorized,
  serializeTask,
  unauthorized,
} from "@/lib/mock-api";

/**
 * Kling text-to-video: creates an asynchronous task and returns 202 with a
 * task id, exactly as the reference documents.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  let body: {
    model?: string;
    prompt?: string;
    duration_seconds?: number;
    aspect_ratio?: string;
    output_resolution?: string;
    callback_url?: string;
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

  const duration = body.duration_seconds ?? 5;
  const perSecond = 0.07;

  const task = createTask(body.model, {
    kind: "video",
    cost: Number((duration * perSecond).toFixed(2)),
  });

  return Response.json(serializeTask(task), {
    status: 202,
    headers: {
      location: `/api/v1/tasks/${task.id}`,
      "x-capi-task-id": task.id,
    },
  });
}
