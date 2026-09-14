import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getRegistry, normalizeKeyProvision, serializeApiKey } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";


export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "read");
    const registry = await getRegistry();
    return Response.json({ object: "list", data: registry.listKeys().filter((key) => key.workspaceId === wid && key.userId === user.id).map((key) => serializeApiKey(key)) });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request, "keys:manage");
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "manage");
    const body = await readAuthBody(request);
    const provision = normalizeKeyProvision(body); if (!provision.ok) return Response.json({ error: provision.error }, { status: 400 });
    const key = await (await getRegistry()).createKey({ userId: user.id, workspaceId: wid, name: provision.name, key: `capi_sk_live_${crypto.randomUUID().replaceAll("-", "")}`, status: 1, group: "default", scopes: provision.scopes, modelLimitsEnabled: false, modelLimits: [], allowIps: [], budgetLimitQuota: provision.budgetLimitQuota, expiredTime: -1, crossGroupRetry: false, autoGroups: [] });
    return Response.json(serializeApiKey(key, true), { status: 201 });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ wid: string }> }) { return authResponse(async () => { requireSameOrigin(request); const user = await requireUser(request, "keys:manage"); const wid = Number((await params).wid); await requireWorkspacePermission(user.id, wid, "manage"); const keyId = Number(new URL(request.url).searchParams.get("id")); if (!Number.isInteger(keyId)) return Response.json({ error: "id is required" }, { status: 400 }); const registry = await getRegistry(); const key = registry.listKeys().find((k) => k.id === keyId && k.workspaceId === wid && k.userId === user.id); if (!key) return Response.json({ error: "key not found" }, { status: 404 }); await registry.deleteKey(keyId); return Response.json({ ok: true }); }); }

export async function PATCH(request: Request, { params }: { params: Promise<{ wid: string }> }) { return authResponse(async () => { requireSameOrigin(request); const user = await requireUser(request, "keys:manage"); const wid = Number((await params).wid); await requireWorkspacePermission(user.id, wid, "manage"); const body = await readAuthBody(request); const id = Number(body.id); const registry = await getRegistry(); const key = registry.listKeys().find((k) => k.id === id && k.workspaceId === wid && k.userId === user.id); if (!key) return Response.json({ error: "key not found" }, { status: 404 }); const updated = await registry.updateKey(id, { key: `capi_sk_live_${crypto.randomUUID().replaceAll("-", "")}`, status: 1 }); return Response.json(serializeApiKey(updated!, true)); }); }
