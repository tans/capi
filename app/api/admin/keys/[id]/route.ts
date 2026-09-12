import { requireAdmin } from "@/lib/relay/admin";
import { getRegistry } from "@/lib/relay";

/**
 * 单个密钥：GET 详情（脱敏）/ PATCH 更新 / DELETE 删除。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const { id } = await params;
  const registry = await getRegistry();
  const apiKey = registry.getKey(Number(id));
  if (!apiKey) return notFound();
  return Response.json({
    ...apiKey,
    key: `${apiKey.key.slice(0, 8)}****${apiKey.key.slice(-4)}`,
  });
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
  delete patch.id;
  delete patch.key; // 密钥本体不可改
  delete patch.usedQuota;

  const registry = await getRegistry();
  const apiKey = await registry.updateKey(
    Number(id),
    patch as Parameters<typeof registry.updateKey>[1],
  );
  if (!apiKey) return notFound();
  return Response.json({
    ...apiKey,
    key: `${apiKey.key.slice(0, 8)}****${apiKey.key.slice(-4)}`,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const { id } = await params;
  const registry = await getRegistry();
  const ok = await registry.deleteKey(Number(id));
  if (!ok) return notFound();
  return Response.json({ deleted: true, id: Number(id) });
}

function notFound() {
  return Response.json({ error: { message: "Key not found." } }, { status: 404 });
}

function badRequest(message: string) {
  return Response.json(
    { error: { type: "invalid_request_error", message, param: null } },
    { status: 400 },
  );
}
