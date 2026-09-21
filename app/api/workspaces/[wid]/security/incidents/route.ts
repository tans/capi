import { authResponse, requireSameOrigin, requireUser } from "@/lib/auth";
import { getRegistry } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const workspaceId = Number((await params).wid);
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) return Response.json({ error: "invalid workspace id" }, { status: 400 });
    const workspace = await requireWorkspacePermission(user.id, workspaceId, "read");
    const url = new URL(request.url);
    const registry = await getRegistry();
    const incidents = registry.listSecurityIncidents(workspaceId, { limit: Number(url.searchParams.get("limit") || 50), status: url.searchParams.get("status") || undefined });
    const canViewEvidence = workspace.role === "owner" || workspace.role === "admin";
    return Response.json({ workspaceId, incidents: incidents.map((incident) => canViewEvidence ? incident : { ...incident, evidence: null }) });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const workspaceId = Number((await params).wid);
    const workspace = await requireWorkspacePermission(user.id, workspaceId, "manage");
    if (workspace.role !== "owner" && workspace.role !== "admin") return Response.json({ error: "permission denied" }, { status: 403 });
    const body = await request.json() as { id?: number; status?: string; severity?: string };
    if (!Number.isInteger(body.id) || typeof body.status !== "string") return Response.json({ error: "id and status are required" }, { status: 400 });
    const registry = await getRegistry();
    if (!registry.updateSecurityIncident(body.id as number, workspaceId, body.status, user.id, body.severity)) return Response.json({ error: "incident not found or status invalid" }, { status: 404 });
    return Response.json({ ok: true });
  });
}
