import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/relay/store";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ wid: string; mid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const { wid: rawWid, mid: rawMid } = await params;
    const wid = Number(rawWid), mid = Number(rawMid);
    const actor = await requireWorkspacePermission(user.id, wid, "manage");
    const body = await readAuthBody(request);
    const db = await getDatabase();
    if (body.action === "transfer_owner") {
      if (actor.role !== "owner") return Response.json({ error: "only the owner can transfer ownership" }, { status: 403 });
      if (actor.kind === "personal") return Response.json({ error: "personal workspace ownership cannot be transferred" }, { status: 409 });
      const target = (await db.query<{ id: number }, [number, number]>("SELECT id FROM workspace_members WHERE id=? AND workspace_id=? AND status='active'").get(mid, wid));
      const current = (await db.query<{ id: number }, [number, number]>("SELECT id FROM workspace_members WHERE workspace_id=? AND user_id=? AND role='owner' AND status='active'").get(wid, user.id));
      if (!target || !current) return Response.json({ error: "member not found" }, { status: 404 });
      if (target.id === current.id) return Response.json({ error: "this user is already the owner" }, { status: 409 });
      await db.transaction(async () => { (await db.query("UPDATE workspace_members SET role='admin' WHERE id=?").run(current.id)); (await db.query("UPDATE workspace_members SET role='owner' WHERE id=?").run(target.id)); }).immediate();
      return Response.json({ ok: true });
    }
    if (body.role !== "admin" && body.role !== "member") return Response.json({ error: "invalid role" }, { status: 400 });
    const target = (await db.query<{ role: string }, [number, number]>("SELECT role FROM workspace_members WHERE id=? AND workspace_id=? AND status='active'").get(mid, wid));
    if (!target) return Response.json({ error: "member not found" }, { status: 404 });
    if (target.role === "owner") return Response.json({ error: "owner role cannot be changed" }, { status: 409 });
    (await db.query("UPDATE workspace_members SET role=? WHERE id=? AND workspace_id=?").run(body.role, mid, wid));
    return Response.json({ ok: true });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ wid: string; mid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const { wid: rawWid, mid: rawMid } = await params;
    const wid = Number(rawWid), mid = Number(rawMid);
    await requireWorkspacePermission(user.id, wid, "manage");
    const db = await getDatabase();
    const target = (await db.query<{ role: string; user_id: number }, [number, number]>("SELECT role,user_id FROM workspace_members WHERE id=? AND workspace_id=? AND status='active'").get(mid, wid));
    if (!target) return Response.json({ error: "member not found" }, { status: 404 });
    if (target.role === "owner") return Response.json({ error: "owner cannot be removed" }, { status: 409 });
    await db.transaction(async () => {
      (await db.query("UPDATE workspace_members SET status='removed' WHERE id=? AND workspace_id=?").run(mid, wid));
      (await db.query("UPDATE api_keys SET config=json_set(config, '$.status', 2) WHERE workspace_id=? AND user_id=? AND json_extract(config, '$.status')=1").run(wid, target.user_id));
    }).immediate();
    return Response.json({ ok: true });
  });
}
