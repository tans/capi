import { maskSecret, requireAdmin } from "@/lib/relay/admin";
import { getRegistry } from "@/lib/relay";

/**
 * 单个渠道：GET 详情 / PATCH 更新（含启用禁用）/ DELETE 删除。
 * Next 16 的动态路由 params 是 Promise。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const { id } = await params;
  const registry = await getRegistry();
  const channel = registry.getChannel(Number(id));
  if (!channel) return notFound();
  return Response.json({ ...channel, keys: channel.keys.map(maskSecret) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const { id } = await params;
  let patch: Record<string, unknown>;
  try {
    patch = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Body must be JSON.");
  }
  for (const field of ["priority", "weight"] as const) {
    const value = patch[field];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      return badRequest(`\`${field}\` must be a finite non-negative number.`);
    }
  }

  // 不允许改 id；keys 只在显式传入时整体替换
  delete patch.id;
  delete patch.usedQuota;
  delete patch.createdTime;

  const registry = await getRegistry();
  const channel = await registry.updateChannel(
    Number(id),
    patch as Parameters<typeof registry.updateChannel>[1],
  );
  if (!channel) return notFound();
  return Response.json({ ...channel, keys: channel.keys.map(maskSecret) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const { id } = await params;
  const registry = await getRegistry();
  const ok = await registry.deleteChannel(Number(id));
  if (!ok) return notFound();
  return Response.json({ deleted: true, id: Number(id) });
}

function notFound() {
  return Response.json(
    { error: { message: "Channel not found." } },
    { status: 404 },
  );
}

function badRequest(message: string) {
  return Response.json(
    { error: { type: "invalid_request_error", message, param: null } },
    { status: 400 },
  );
}
