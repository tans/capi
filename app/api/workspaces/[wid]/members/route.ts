import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/relay/store";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const id = Number((await params).wid);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid workspace id" }, { status: 400 });
    await requireWorkspacePermission(user.id, id, "read");
    const db = await getDatabase();
    const data = db.query<{ id: number; userId: number; email: string; name: string; role: string; status: string }, [number]>(
      `SELECT m.id, u.id AS userId, u.email, u.name, m.role, m.status
       FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY m.id`,
    ).all(id);
    return Response.json({ object: "list", data });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request); const user = await requireUser(request); const id = Number((await params).wid);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid workspace id" }, { status: 400 });
    await requireWorkspacePermission(user.id, id, "manage"); const body = await readAuthBody(request); const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return Response.json({ error: "email is required" }, { status: 400 }); const db = await getDatabase(); const target = db.query<{ id:number }, [string]>("SELECT id FROM users WHERE email = ?").get(email);
    if (!target) return Response.json({ error: "user not found; they must register first" }, { status: 404 });
    try { db.query("INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)").run(id, target.id, Date.now()); } catch { return Response.json({ error: "user is already a member" }, { status: 409 }); }
    return Response.json({ ok: true }, { status: 201 });
  });
}
