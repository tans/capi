import type { ExecutionRequest } from "./types";

const COMPAT_URL = process.env.CAPI_COMPAT_URL ?? "http://compat:4000";
const SERVICE_TOKEN = process.env.CAPI_COMPAT_TOKEN ?? "";

/** Calls the in-house compat service; one request is exactly one upstream attempt. */
export async function executeWithLiteLLM(input: ExecutionRequest): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (SERVICE_TOKEN) headers.authorization = `Bearer ${SERVICE_TOKEN}`;
  let response: Response;
  try {
    response = await fetch(`${COMPAT_URL}/internal/v1/execute`, {
      method: "POST", headers, body: JSON.stringify(input),
      signal: AbortSignal.timeout(Math.max(1_000, Date.parse(input.execution.deadlineAt) - Date.now())),
    });
  } catch (error) {
    throw new Error(`compat service unavailable: ${error instanceof Error ? error.message : "network error"}`);
  }
  if (!response.ok) throw new Error(`compat service returned ${response.status}`);
  return response;
}

/** Converts internal events back to the public OpenAI-compatible response. */
export async function executeLiteLLMRequest(input: ExecutionRequest): Promise<Response> {
  const internal = await executeWithLiteLLM(input);
  if (!internal.body) throw new Error("compat service returned an empty body");
  const decoder = new TextDecoder();
  let buffer = "";
  let responsePayload: unknown;
  let errorPayload: { message?: string } | undefined;
  const stream = input.body.stream === true;
  const output = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (value: unknown) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));
      try {
        const reader = internal.body!.getReader();
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          buffer += decoder.decode(next.value, { stream: true });
          const parts = buffer.split("\n\n"); buffer = parts.pop() ?? "";
          for (const part of parts) {
            const kind = part.match(/^event:\s*(\S+)/m)?.[1];
            const raw = part.match(/^data:\s*(.*)$/m)?.[1];
            if (!kind || !raw) continue;
            const data: unknown = JSON.parse(raw);
            if (kind === "response") responsePayload = data;
            else if (kind === "chunk" && stream && isRecord(data) && "data" in data) emit(data.data);
            else if (kind === "error" && isRecord(data)) errorPayload = { message: typeof data.message === "string" ? data.message : undefined };
          }
        }
        if (errorPayload) throw new Error(errorPayload.message ?? "compat upstream error");
        if (!stream) controller.enqueue(new TextEncoder().encode(JSON.stringify(responsePayload ?? {})));
        else controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) { controller.error(error); }
    },
  });
  return new Response(output, { status: 200, headers: stream ? { "content-type": "text/event-stream; charset=utf-8" } : { "content-type": "application/json" } });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
