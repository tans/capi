import { randomBytes, createHash } from "node:crypto";
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
    const invites = db.query<{id:number;email:string;role:string;expiresAt:number;createdAt:number}, [number]>("SELECT id,email,role,expires_at AS expiresAt,created_at AS createdAt FROM workspace_invites WHERE workspace_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? ORDER BY id DESC").all(id);
    const data = db.query<{ id: number; userId: number; email: string; name: string; role: string; status: string }, [number]>(
      `SELECT m.id, u.id AS userId, u.email, u.name, m.role, m.status
       FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? AND m.status = 'active' ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.id`,
    ).all(id);
    return Response.json({ object: "list", data, invites });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request); const user = await requireUser(request); const id = Number((await params).wid);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid workspace id" }, { status: 400 });
    await requireWorkspacePermission(user.id, id, "manage"); const body = await readAuthBody(request); const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return Response.json({ error: "email is required" }, { status: 400 }); const db = await getDatabase();
    const requestedRole=body.role === "admin" ? "admin" : "member";
    const existingMember = db.query<{id:number}, [number,string]>("SELECT m.id FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND lower(u.email)=lower(?) AND m.status=\'active\'").get(id,email);
    if (existingMember) return Response.json({ error: "user is already a workspace member" }, { status: 409 });
    const pending = db.query<{id:number}, [number,string,number]>("SELECT id FROM workspace_invites WHERE workspace_id=? AND lower(email)=lower(?) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? LIMIT 1").get(id,email,Date.now());
    if (pending) return Response.json({ error: "an active invite already exists" }, { status: 409 });
    const token=randomBytes(32).toString("base64url"); const hash=createHash("sha256").update(token).digest("hex"); const invite=db.query<{id:number},[number,string,string,string,number,number]>("INSERT INTO workspace_invites (workspace_id,email,token_hash,role,expires_at,created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id").get(id,email,hash,requestedRole,Date.now()+7*86400000,Date.now());
    return Response.json({ id: invite?.id, email, token, expiresAt: Date.now()+7*86400000 }, { status: 201 });
  });
}
