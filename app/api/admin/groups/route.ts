import { requireAdmin } from "@/lib/relay/admin";
import { getRegistry, normalizeGroupInput } from "@/lib/relay";

/**
 * 分组管理：GET 列表 / POST 新建。
 * 分组名是不可变标识，渠道（Channel.groups）与密钥（ApiKey.group）按名引用。
 */
export async function GET(request: Request) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const registry = await getRegistry();
  return Response.json({ object: "list", data: (await registry.listGroups()) });
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Body must be JSON.");
  }

  const normalized = normalizeGroupInput(body);
  if (!normalized.ok) return badRequest(normalized.error);

  const registry = await getRegistry();
  const group = (await registry.createGroup(normalized.value as Parameters<typeof registry.createGroup>[0]));
  if (!group) {
    return Response.json(
      { error: { type: "invalid_request_error", message: `The group “${normalized.value.name}” already exists.`, param: "name" } },
      { status: 409 },
    );
  }
  return Response.json(group, { status: 201 });
}

function badRequest(message: string) {
  return Response.json(
    { error: { type: "invalid_request_error", message, param: null } },
    { status: 400 },
  );
}
