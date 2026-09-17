import { requireAdmin } from "@/lib/relay/admin";
import { getRegistry, listInput } from "@/lib/relay";
import { fetchUpstreamModels } from "@/lib/relay/discovery";

/**
 * 渠道模型发现（管理台）：用给定或已存渠道的上游信息拉取 /models。
 * 鉴权见 lib/relay/admin.ts（CAPI_ADMIN_TOKEN）。
 */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Body must be JSON.");
  }

  const channelId = body.channelId === undefined || body.channelId === null ? undefined : Number(body.channelId);
  const registry = await getRegistry();
  const channel = channelId === undefined ? undefined : registry.getChannel(channelId);
  if (channelId !== undefined && !channel) return notFound();

  const key = listInput(body.keys)[0] ?? channel?.keys[0];
  if (!key) return badRequest("Provide an API key.");

  const requestedBaseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const baseUrl = requestedBaseUrl || channel?.baseUrl;
  if (!baseUrl) return badRequest("baseUrl is required.");

  // 渠道自带的请求头在前，显式传入的请求头覆盖它
  const headers: Record<string, string> = { ...(channel?.headers ?? {}) };
  if (body.headers && typeof body.headers === "object" && !Array.isArray(body.headers)) {
    for (const [name, value] of Object.entries(body.headers)) if (typeof value === "string") headers[name] = value;
  }

  const result = await fetchUpstreamModels({ baseUrl, key, headers });
  if (!result.ok) return Response.json({ error: { type: "invalid_request_error", message: result.error, param: null } }, { status: 502 });
  return Response.json({ object: "list", data: result.models });
}

function badRequest(message: string) {
  return Response.json(
    { error: { type: "invalid_request_error", message, param: null } },
    { status: 400 },
  );
}

function notFound() {
  return Response.json(
    { error: { message: "Channel not found." } },
    { status: 404 },
  );
}
