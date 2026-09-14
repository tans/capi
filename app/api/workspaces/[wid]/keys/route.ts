import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getRegistry, OPERATION_SCOPES, usdToQuota, quotaToUsd } from "@/lib/relay";
import type { ApiKey } from "@/lib/relay/types";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

const scopes = new Set<string>(OPERATION_SCOPES);
function output(key: ApiKey, reveal = false) {
 return { id: String(key.id), name: key.name, workspaceId: key.workspaceId,
    secret: reveal ? key.key : `${key.key.slice(0, 14)}${"•".repeat(8)}${key.key.slice(-4)}`,
    scopes: key.scopes ?? [], budget: key.unlimitedQuota ? "Unlimited" : `$${quotaToUsd(key.remainQuota).toFixed(2)}`,
    created: new Date(key.createdTime).toISOString(), lastUsed: key.accessedTime ? new Date(key.accessedTime).toISOString() : "" };
}

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "read");
    const registry = await getRegistry();
    return Response.json({ object: "list", data: registry.listKeys().filter((key) => key.workspaceId === wid && key.userId === user.id).map((key) => output(key)) });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request, "keys:manage");
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "manage");
    const body = await readAuthBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const rawScopes = typeof body.scopes === "string" ? [...new Set(body.scopes.split(",").map((s) => s.trim()).filter(Boolean))] : [];
    if (!name || name.length > 100 || !rawScopes.length || rawScopes.some((scope) => !scopes.has(scope))) return Response.json({ error: "invalid name or scopes" }, { status: 400 });
    const budget = typeof body.budget === "string" ? body.budget.trim() : "";
    if (budget && (!/^\d+(?:\.\d{1,2})?$/.test(budget) || Number(budget) <= 0)) return Response.json({ error: "invalid budget" }, { status: 400 });
 const key = await (await getRegistry()).createKey({ userId: user.id, workspaceId: wid, name, key: `capi_sk_live_${crypto.randomUUID().replaceAll("-", "")}`, status: 1, group: "default", scopes: rawScopes, modelLimitsEnabled: false, modelLimits: [], allowIps: [], remainQuota: budget ? usdToQuota(Number(budget)) : 0, unlimitedQuota: !budget, expiredTime: -1, crossGroupRetry: false, autoGroups: [] });
    return Response.json(output(key, true), { status: 201 });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ wid: string }> }) { return authResponse(async () => { requireSameOrigin(request); const user = await requireUser(request, "keys:manage"); const wid = Number((await params).wid); await requireWorkspacePermission(user.id, wid, "manage"); const keyId = Number(new URL(request.url).searchParams.get("id")); if (!Number.isInteger(keyId)) return Response.json({ error: "id is required" }, { status: 400 }); const registry = await getRegistry(); const key = registry.listKeys().find((k) => k.id === keyId && k.workspaceId === wid && k.userId === user.id); if (!key) return Response.json({ error: "key not found" }, { status: 404 }); await registry.deleteKey(keyId); return Response.json({ ok: true }); }); }

export async function PATCH(request: Request, { params }: { params: Promise<{ wid: string }> }) { return authResponse(async () => { requireSameOrigin(request); const user = await requireUser(request, "keys:manage"); const wid = Number((await params).wid); await requireWorkspacePermission(user.id, wid, "manage"); const body = await readAuthBody(request); const id = Number(body.id); const registry = await getRegistry(); const key = registry.listKeys().find((k) => k.id === id && k.workspaceId === wid && k.userId === user.id); if (!key) return Response.json({ error: "key not found" }, { status: 404 }); const updated = await registry.updateKey(id, { key: `capi_sk_live_${crypto.randomUUID().replaceAll("-", "")}`, status: 1 }); return Response.json(output(updated!, true)); }); }
