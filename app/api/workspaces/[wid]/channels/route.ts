import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getRegistry } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "read");
    const registry = await getRegistry();
    const data = registry.listChannels().filter((c) => c.ownerType === "workspace" && c.workspaceId === wid).map(({ keys, headers, ...channel }) => ({ ...channel, keyCount: keys.length, hasHeaders: Boolean(headers && Object.keys(headers).length) }));
    return Response.json({ object: "list", data });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "manage");
    const body = await readAuthBody(request);
    if (typeof body.name !== "string" || typeof body.baseUrl !== "string" || !Array.isArray(body.models)) return Response.json({ error: "name, baseUrl and models are required" }, { status: 400 });
    const registry = await getRegistry();
    const channel = await registry.createChannel({ name: body.name.trim(), type: "openai-compatible", baseUrl: body.baseUrl.trim(), keys: Array.isArray(body.keys) ? body.keys.filter((key): key is string => typeof key === "string") : [], multiKeyMode: "polling", models: body.models.filter((model): model is string => typeof model === "string"), groups: ["default"], priority: 0, weight: 1, status: 1, autoBan: true, ownerType: "workspace", workspaceId: wid });
    const { keys, headers, ...safe } = channel;
    return Response.json({ ...safe, keyCount: keys.length, hasHeaders: Boolean(headers && Object.keys(headers).length) }, { status: 201 });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ wid: string }> }) { return authResponse(async () => { requireSameOrigin(request); const user = await requireUser(request); const wid = Number((await params).wid); await requireWorkspacePermission(user.id, wid, "manage"); const body = await readAuthBody(request); const id = Number(body.id); if (!Number.isInteger(id)) return Response.json({ error: "id is required" }, { status: 400 }); const registry = await getRegistry(); const channel = registry.listChannels().find((c) => c.id === id && c.ownerType === "workspace" && c.workspaceId === wid); if (!channel) return Response.json({ error: "channel not found" }, { status: 404 }); const patch: Record<string, unknown> = {}; if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim(); if (body.status === 1 || body.status === 2) patch.status = body.status; const updated = await registry.updateChannel(id, patch); return Response.json({ ...updated, keyCount: updated?.keys.length ?? 0 }, { status: 200 }); }); }

export async function DELETE(request: Request, { params }: { params: Promise<{ wid: string }> }) { return authResponse(async () => { requireSameOrigin(request); const user = await requireUser(request); const wid = Number((await params).wid); await requireWorkspacePermission(user.id, wid, "manage"); const id = Number(new URL(request.url).searchParams.get("id")); const registry = await getRegistry(); const channel = registry.listChannels().find((c) => c.id === id && c.ownerType === "workspace" && c.workspaceId === wid); if (!channel) return Response.json({ error: "channel not found" }, { status: 404 }); await registry.deleteChannel(id); return Response.json({ ok: true }); }); }
