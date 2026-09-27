import {
  authenticateKey,
  getRegistry,
  newRequestId,
  relayErrorResponse,
  relayImageGeneration,
} from "@/lib/relay";
import { PayloadTooLargeError, readRequestBytesLimited } from "@/lib/relay/files";

export async function POST(request: Request) {
  const registry = await getRegistry();
  const auth = (await authenticateKey(registry, request, "image.generate"));
  if (!auth.ok) return auth.response;
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 1_048_576) {
    return Response.json({ error: { type: "invalid_request_error", code: "body_too_large", message: "Request body must not exceed 1 MiB." } }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse((await readRequestBytesLimited(request, 1_048_576)).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid body");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return Response.json({ error: { type: "invalid_request_error", code: "body_too_large", message: "Request body must not exceed 1 MiB." } }, { status: 413 });
    return Response.json({ error: { type: "invalid_request_error", code: "invalid_json", message: "Body must be a JSON object." } }, { status: 400 });
  }
  if (typeof body.model !== "string" || !body.model.trim()) {
    return Response.json({ error: { type: "invalid_request_error", code: "invalid_model", message: "Missing required parameter: model.", param: "model" } }, { status: 400 });
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return Response.json({ error: { type: "invalid_request_error", code: "invalid_prompt", message: "Missing required parameter: prompt.", param: "prompt" } }, { status: 400 });
  }

  const requestId = newRequestId();
  try {
    return await relayImageGeneration({ registry, apiKey: auth.apiKey, pinnedChannelId: auth.pinnedChannelId, requestId, body: body as Record<string, unknown> & { model: string; prompt: string } });
  } catch (error) {
    console.error("[relay] image generation failed:", error);
    return relayErrorResponse(error, requestId);
  }
}
