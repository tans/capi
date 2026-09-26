import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getRegistry, normalizeChannelInput } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "read");
    const registry = await getRegistry();
    const data = (await registry.listChannels()).filter((c) => c.ownerType === "workspace" && c.workspaceId === wid).map(({ keys, headers, ...channel }) => ({ ...channel, keyCount: keys.length, hasHeaders: Boolean(headers && Object.keys(headers).length) }));
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
    const normalized = normalizeChannelInput(body);
    if (!normalized.ok) return Response.json({ error: normalized.error }, { status: 400 });
    const registry = await getRegistry();
    const channel = await registry.createChannel({ ...normalized.value, ownerType: "workspace", workspaceId: wid } as Parameters<typeof registry.createChannel>[0]);
    const { keys, headers, ...safe } = channel;
    return Response.json({ ...safe, keyCount: keys.length, hasHeaders: Boolean(headers && Object.keys(headers).length) }, { status: 201 });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ wid: string }> }) { return authResponse(async () => { requireSameOrigin(request); const user = await requireUser(request); const wid = Number((await params).wid); await requireWorkspacePermission(user.id, wid, "manage"); const body = await readAuthBody(request); const id = Number(body.id); if (!Number.isInteger(id)) return Response.json({ error: "id is required" }, { status: 400 }); const registry = await getRegistry(); const channel = (await registry.listChannels()).find((c) => c.id === id && c.ownerType === "workspace" && c.workspaceId === wid); if (!channel) return Response.json({ error: "channel not found" }, { status: 404 }); const normalized = normalizeChannelInput(body, { partial: true, requireKeys: true }); if (!normalized.ok) return Response.json({ error: normalized.error }, { status: 400 }); const updated = await registry.updateChannel(id, normalized.value); if (!updated) return Response.json({ error: "channel not found" }, { status: 404 }); const { keys, headers, ...safe } = updated; return Response.json({ ...safe, keyCount: keys.length, hasHeaders: Boolean(headers && Object.keys(headers).length) }, { status: 200 }); }); }

export async function DELETE(request: Request, { params }: { params: Promise<{ wid: string }> }) { return authResponse(async () => { requireSameOrigin(request); const user = await requireUser(request); const wid = Number((await params).wid); await requireWorkspacePermission(user.id, wid, "manage"); const id = Number(new URL(request.url).searchParams.get("id")); const registry = await getRegistry(); const channel = (await registry.listChannels()).find((c) => c.id === id && c.ownerType === "workspace" && c.workspaceId === wid); if (!channel) return Response.json({ error: "channel not found" }, { status: 404 }); await registry.deleteChannel(id); return Response.json({ ok: true }); }); }
