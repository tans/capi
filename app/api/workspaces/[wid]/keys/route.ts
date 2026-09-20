import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getRegistry, normalizeKeyProvision, serializeApiKey } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const wid = Number((await params).wid);
    const workspace = await requireWorkspacePermission(user.id, wid, "read");
    const registry = await getRegistry();
    const keys = registry.listKeys().filter((key) => key.workspaceId === wid && (workspace.role !== "member" || key.userId === user.id));
    return Response.json({ object: "list", data: keys.map((key) => serializeApiKey(key)) });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request, "keys:manage");
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "manage");
    const body = await readAuthBody(request);
    const registry = await getRegistry();
    const provision = normalizeKeyProvision(body, registry.listGroups().map((group) => group.name));
    if (!provision.ok) return Response.json({ error: provision.error }, { status: 400 });
    const key = await registry.createKey({ userId: user.id, workspaceId: wid, name: provision.name, key: `capi_sk_live_${crypto.randomUUID().replaceAll("-", "")}`, status: 1, group: provision.group, scopes: provision.scopes, modelLimitsEnabled: false, modelLimits: [], allowIps: [], budgetLimitQuota: provision.budgetLimitQuota, expiredTime: -1, crossGroupRetry: false, autoGroups: [] });
    return Response.json(serializeApiKey(key), { status: 201 });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request, "keys:manage");
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "manage");
    const keyId = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(keyId)) return Response.json({ error: "id is required" }, { status: 400 });
    const registry = await getRegistry();
    const key = registry.listKeys().find((candidate) => candidate.id === keyId && candidate.workspaceId === wid);
    if (!key) return Response.json({ error: "key not found" }, { status: 404 });
    await registry.deleteKey(keyId);
    return Response.json({ ok: true });
  });
}

/**
 * Key mutations: `rotate` re-issues the secret, `edit` updates name/group/scopes/budget.
 * Revocation stays on DELETE because it is terminal.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request, "keys:manage");
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "manage");
    const body = await readAuthBody(request);
    const id = Number(body.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id is required" }, { status: 400 });
    const registry = await getRegistry();
    const key = registry.listKeys().find((candidate) => candidate.id === id && candidate.workspaceId === wid);
    if (!key) return Response.json({ error: "key not found" }, { status: 404 });
    if (body.action === "rotate") {
      if (key.status !== 1) return Response.json({ error: "revoked keys cannot be rotated" }, { status: 409 });
      const updated = await registry.updateKey(id, { key: `capi_sk_live_${crypto.randomUUID().replaceAll("-", "")}`, status: 1 });
      return Response.json(serializeApiKey(updated!));
    }
    if (body.action !== "edit") return Response.json({ error: "invalid action" }, { status: 400 });
    const provision = normalizeKeyProvision(
      { name: body.name, scopes: body.scopes, group: body.group, budget: body.budget },
      registry.listGroups().map((group) => group.name),
    );
    if (!provision.ok) return Response.json({ error: provision.error }, { status: 400 });
    const updated = await registry.updateKey(id, { name: provision.name, group: provision.group, scopes: provision.scopes, budgetLimitQuota: provision.budgetLimitQuota });
    return Response.json(serializeApiKey(updated!));
  });
}
