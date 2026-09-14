import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/relay/store";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) { return authResponse(async () => { const user = await requireUser(request); const id = Number((await params).wid); await requireWorkspacePermission(user.id, id, "read"); const db = await getDatabase(); return Response.json({ object: "list", data: db.query("SELECT id,name,status,routing_mode,is_default,created_at AS createdAt FROM projects WHERE workspace_id=? ORDER BY id").all(id) }); }); }

export async function POST(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request); const id = Number((await params).wid);
    const workspace = await requireWorkspacePermission(user.id, id, "manage");
    const body = await readAuthBody(request); const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) return Response.json({ error: "project name is required" }, { status: 400 });
    const db = await getDatabase(); const row = db.query<{ id: number }, [number, string, number]>("INSERT INTO projects (workspace_id,name,is_default,created_at) VALUES (?,?,0,?) RETURNING id").get(id, name, Date.now());
    return Response.json({ id: row?.id, name, workspaceId: workspace.id }, { status: 201 });
  });
}
