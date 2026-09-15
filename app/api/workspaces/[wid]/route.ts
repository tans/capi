import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/relay/store";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

async function workspaceId(params: Promise<{ wid: string }>) {
  const id = Number((await params).wid);
  if (!Number.isInteger(id) || id <= 0) throw new Error("invalid workspace id");
  return id;
}

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const id = await workspaceId(params);
    return Response.json(await requireWorkspacePermission(user.id, id, "read"));
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const id = await workspaceId(params);
    await requireWorkspacePermission(user.id, id, "manage");
    const body = await readAuthBody(request);
    const name = body.name === undefined ? undefined : typeof body.name === "string" ? body.name.trim() : "";
    const allowPlatformChannels = body.allowPlatformChannels;
    if (name !== undefined && (!name || name.length > 100)) return Response.json({ error: "name must contain 1–100 characters" }, { status: 400 });
    if (allowPlatformChannels !== undefined && typeof allowPlatformChannels !== "boolean") return Response.json({ error: "allowPlatformChannels must be a boolean" }, { status: 400 });
    const db = await getDatabase();
    if (name !== undefined) db.query("UPDATE workspaces SET name = ? WHERE id = ?").run(name, id);
    if (allowPlatformChannels !== undefined) db.query("UPDATE workspaces SET allow_platform_channels = ? WHERE id = ?").run(Number(allowPlatformChannels), id);
    return Response.json(await requireWorkspacePermission(user.id, id, "read"));
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ wid: string }> }) { return authResponse(async () => { requireSameOrigin(request); const user = await requireUser(request); const id = await workspaceId(params); const workspace = await requireWorkspacePermission(user.id, id, "manage"); if (workspace.role !== "owner" || workspace.kind === "personal") return Response.json({ error: "only team owners can delete a team workspace" }, { status: 403 }); const db = await getDatabase(); const owners = db.query<{count:number},[number]>("SELECT count(*) as count FROM workspace_members WHERE workspace_id=? AND role='owner' AND status='active'").get(id)?.count ?? 0; if (owners < 1) return Response.json({ error: "workspace must retain an owner" }, { status: 409 }); db.query("UPDATE workspaces SET status='deleted' WHERE id=?").run(id); return Response.json({ ok: true }); }); }
