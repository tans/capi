import { requireAdmin } from "@/lib/relay/admin";
import { getRegistry, normalizeGroupInput } from "@/lib/relay";

/**
 * 单个分组：PATCH 更新（显示名/倍率/说明/启停）/ DELETE 删除。
 * 删除会同时把该分组从渠道与密钥上摘除，见 RelayRegistry.deleteGroup。
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Body must be JSON.");
  }

  const normalized = normalizeGroupInput(body, { partial: true });
  if (!normalized.ok) return badRequest(normalized.error);

  // 分组名不可改：渠道与密钥按名引用，改名会留下悬空引用
  const patch = { ...normalized.value };
  delete patch.name;

  const registry = await getRegistry();
  const group = await registry.updateGroup(Number(id), patch);
  if (!group) return notFound();
  return Response.json(group);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const { id } = await params;
  const registry = await getRegistry();
  const deleted = await registry.deleteGroup(Number(id));
  if (!deleted) return notFound();
  return Response.json({ deleted: true, id: Number(id) });
}

function notFound() {
  return Response.json(
    { error: { message: "Group not found." } },
    { status: 404 },
  );
}

function badRequest(message: string) {
  return Response.json(
    { error: { type: "invalid_request_error", message, param: null } },
    { status: 400 },
  );
}
