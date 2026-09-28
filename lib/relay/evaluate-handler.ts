import {
  authenticateKey,
  getRegistry,
  newRequestId,
  normalizeEvaluateBody,
  relayErrorResponse,
  relayEvaluate,
} from "@/lib/relay";

type EvaluateEndpointOptions = { systemOne?: boolean };

/** Shared HTTP handling for the generic Evaluate and TypeSafe System One routes. */
export async function handleEvaluateRequest(
  request: Request,
  { systemOne = false }: EvaluateEndpointOptions = {},
): Promise<Response> {
  const registry = await getRegistry();
  const auth = await authenticateKey(registry, request, "llm.evaluate");
  if (!auth.ok) return auth.response;

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 1_048_576) {
    return Response.json({ error: { type: "invalid_request_error", code: "body_too_large", message: "Request body must not exceed 1 MiB.", param: null } }, { status: 413 });
  }

  let raw: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Body must be a JSON object.");
    raw = value as Record<string, unknown>;
  } catch {
    return Response.json({ error: { type: "invalid_request_error", code: "invalid_json", message: "Body must be a JSON object.", param: null } }, { status: 400 });
  }

  const parsed = normalizeEvaluateBody(raw);
  if (!parsed.ok) {
    return Response.json(
      { error: { type: "invalid_request_error", code: "invalid_request", message: parsed.error, param: null } },
      { status: systemOne ? 422 : 400 },
    );
  }
  if (systemOne) {
    const unsupported = Object.entries(parsed.value.questions).find(([, question]) => {
      const type = (question as Record<string, unknown>).type;
      return type !== "noul" && type !== "choice" && type !== "score";
    });
    if (unsupported) {
      return Response.json(
        { error: { type: "invalid_request_error", code: "unsupported_question_type", message: `Question "${unsupported[0]}" must use noul, choice, or score on the System One endpoint.`, param: "questions" } },
        { status: 422 },
      );
    }
  }

  const requestId = newRequestId();
  try {
    return await relayEvaluate({
      registry,
      apiKey: auth.apiKey,
      pinnedChannelId: auth.pinnedChannelId,
      requestId,
      body: parsed.value,
    });
  } catch (error) {
    console.error(`[relay] ${systemOne ? "system one" : "evaluation"} request failed:`, error);
    return relayErrorResponse(error, requestId);
  }
}

export function evaluateMethodNotAllowed(label: "evaluations" | "System One") {
  return Response.json(
    { error: { type: "invalid_request_error", code: "method_not_allowed", message: `Use POST for ${label}.`, param: null } },
    { status: 405, headers: { allow: "POST" } },
  );
}
