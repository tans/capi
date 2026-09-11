import {
  getTask,
  isAuthorized,
  serializeTask,
  unauthorized,
} from "@/lib/mock-api";

/** Poll an asynchronous task. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorized(request)) return unauthorized();

  const { id } = await params;
  const task = getTask(id);

  if (!task) {
    return Response.json(
      {
        error: {
          type: "invalid_request_error",
          code: "task_not_found",
          message: `No task found with id ${id}. Tasks are held in memory and reset when the server restarts.`,
        },
      },
      { status: 404 },
    );
  }

  return Response.json(serializeTask(task), {
    headers: {
      "cache-control": "no-store",
      "x-capi-task-status": task.status,
    },
  });
}
