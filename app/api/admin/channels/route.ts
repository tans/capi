import { maskSecret, requireAdmin } from "@/lib/relay/admin";
import { getRegistry, isSupportedChannelType } from "@/lib/relay";
import { isBlockedUpstreamHost, type ChannelType, type MultiKeyMode } from "@/lib/relay/types";

/**
 * 渠道管理：GET 列表 / POST 新建。
 * 鉴权见 lib/relay/admin.ts（CAPI_ADMIN_TOKEN）。
 */
export async function GET(request: Request) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const registry = await getRegistry();
  return Response.json({
    object: "list",
    data: registry.listChannels().map((channel) => ({
      ...channel,
      keys: channel.keys.map(maskSecret),
    })),
  });
}

type ChannelCreateBody = {
  name: string;
  type?: ChannelType;
  baseUrl: string;
  keys: string[] | string;
  multiKeyMode?: MultiKeyMode;
  models: string[] | string;
  groups?: string[] | string;
  priority?: number;
  weight?: number;
  status?: 1 | 2 | 3;
  autoBan?: boolean;
  modelMapping?: Record<string, string>;
  headers?: Record<string, string>;
  paramOverride?: Record<string, unknown>;
  tag?: string;
};

export async function POST(request: Request) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  let body: ChannelCreateBody;
  try {
    body = (await request.json()) as ChannelCreateBody;
  } catch {
    return badRequest("Body must be JSON.");
  }

  if (!body.name || !body.baseUrl) {
    return badRequest("`name` and `baseUrl` are required.");
  }
  for (const field of ["priority", "weight"] as const) {
    const value = body[field];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      return badRequest(`\`${field}\` must be a finite non-negative number.`);
    }
  }

  if (body.type !== undefined && !isSupportedChannelType(body.type)) {
    return badRequest("Only OpenAI and OpenAI-compatible channels are supported.");
  }

  try {
    const upstream = new URL(body.baseUrl);
    if (upstream.protocol !== "https:" || upstream.username || upstream.password || isBlockedUpstreamHost(upstream.hostname)) {
      return badRequest("Upstream URL must be public HTTPS and must not include credentials.");
    }
  } catch {
    return badRequest("`baseUrl` must be a valid HTTPS URL.");
  }

  const keys = toArray(body.keys);
  const models = toArray(body.models);
  if (keys.length === 0) return badRequest("At least one upstream key is required.");
  if (models.length === 0) return badRequest("At least one model is required.");

  const registry = await getRegistry();
  const channel = await registry.createChannel({
    name: body.name,
    type: body.type ?? "openai-compatible",
    baseUrl: body.baseUrl,
    keys,
    multiKeyMode: body.multiKeyMode ?? "random",
    models,
    groups: toArray(body.groups).length > 0 ? toArray(body.groups) : ["default"],
    priority: body.priority ?? 0,
    weight: body.weight ?? 0,
    status: body.status ?? 1,
    autoBan: body.autoBan ?? true,
    modelMapping: body.modelMapping,
    headers: body.headers,
    paramOverride: body.paramOverride,
    tag: body.tag,
  });

  return Response.json(
    { ...channel, keys: channel.keys.map(maskSecret) },
    { status: 201 },
  );
}

function toArray(value: string[] | string | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean);
  return value
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function badRequest(message: string) {
  return Response.json(
    { error: { type: "invalid_request_error", message, param: null } },
    { status: 400 },
  );
}
