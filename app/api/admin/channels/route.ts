import { maskSecret, requireAdmin } from "@/lib/relay/admin";
import { getRegistry, normalizeChannelInput } from "@/lib/relay";
import { getDatabase } from "@/lib/relay/store";
import type { ChannelType, MultiKeyMode } from "@/lib/relay/types";

/**
 * 渠道管理：GET 列表 / POST 新建。
 * 鉴权见 lib/relay/admin.ts（CAPI_ADMIN_TOKEN）。
 */
export async function GET(request: Request) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const registry = await getRegistry();
  const channels = (await registry.listChannels());
  const workspaceNames = new Map<number, string>();
  if (channels.some((channel) => channel.workspaceId !== undefined)) {
    const db = await getDatabase();
    for (const row of (await db.query<{ id: number; name: string }, []>("SELECT id, name FROM workspaces").all())) {
      workspaceNames.set(row.id, row.name);
    }
  }
  return Response.json({
    object: "list",
    data: channels.map((channel) => ({
      ...channel,
      keys: channel.keys.map(maskSecret),
      ...(channel.workspaceId === undefined ? {} : { workspaceName: workspaceNames.get(channel.workspaceId) ?? `#${channel.workspaceId}` }),
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

  const normalized = normalizeChannelInput(body as unknown as Record<string, unknown>);
  if (!normalized.ok) return badRequest(normalized.error);

  const registry = await getRegistry();
  const channel = await registry.createChannel({
    ...normalized.value,
  } as Parameters<typeof registry.createChannel>[0]);

  return Response.json(
    { ...channel, keys: channel.keys.map(maskSecret) },
    { status: 201 },
  );
}

function badRequest(message: string) {
  return Response.json(
    { error: { type: "invalid_request_error", message, param: null } },
    { status: 400 },
  );
}
