import {
  authenticateKey,
  getRegistry,
  newRequestId,
  relayErrorResponse,
  relayResponses,
} from "@/lib/relay";
import { resolveResponsesFileInputs } from "@/lib/relay/files";
import { PayloadTooLargeError, readRequestBytesLimited } from "@/lib/relay/files";

type ResponsesRequestBody = Record<string, unknown> & {
  model?: string;
  input?: unknown;
  stream?: boolean;
};

/** Native Responses pass-through. The upstream owns output items and SSE events. */
export async function POST(request: Request) {
  const registry = await getRegistry();
  const auth = (await authenticateKey(registry, request, "llm.chat"));
  if (!auth.ok) return auth.response;
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 36 * 1024 * 1024) {
    return Response.json({ error: { type: "invalid_request_error", code: "body_too_large", message: "Request body must not exceed 36 MiB." } }, { status: 413 });
  }

  let body: ResponsesRequestBody;
  try {
    body = JSON.parse((await readRequestBytesLimited(request, 36 * 1024 * 1024)).toString("utf8")) as ResponsesRequestBody;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return Response.json({ error: { type: "invalid_request_error", code: "body_too_large", message: "Request body must not exceed 36 MiB." } }, { status: 413 });
    return Response.json({ error: { type: "invalid_request_error", message: "Body must be JSON." } }, { status: 400 });
  }
  if (typeof body.model !== "string" || body.model.length === 0) {
    return Response.json({ error: { type: "invalid_request_error", code: "invalid_model", message: "Missing required parameter: model." } }, { status: 400 });
  }
  if (body.input === undefined) {
    return Response.json({ error: { type: "invalid_request_error", code: "invalid_input", message: "Missing required parameter: input." } }, { status: 400 });
  }

  try {
    body = await resolveResponsesFileInputs(body, registry.database, auth.apiKey.workspaceId) as ResponsesRequestBody;
  } catch (error) {
    return Response.json({ error: { type: "invalid_request_error", code: "invalid_file_reference", message: error instanceof Error ? error.message : "Invalid file reference." } }, { status: 400 });
  }

  const requestId = newRequestId();
  try {
    return await relayResponses({
      registry,
      apiKey: auth.apiKey,
      pinnedChannelId: auth.pinnedChannelId,
      requestId,
      body: body as Record<string, unknown> & { model: string; stream?: boolean },
    });
  } catch (error) {
    console.error("[relay] responses failed:", error);
    return relayErrorResponse(error, requestId);
  }
}

export async function GET() {
  return Response.json({ error: { type: "invalid_request_error", code: "method_not_allowed", message: "Use POST for responses." } }, { status: 405, headers: { allow: "POST" } });
}
