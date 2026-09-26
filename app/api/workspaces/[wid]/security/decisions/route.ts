import { authResponse, requireUser } from "@/lib/auth";
import { getRegistry } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const workspaceId = Number((await params).wid);
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) return Response.json({ error: "invalid workspace id" }, { status: 400 });
    const workspace = await requireWorkspacePermission(user.id, workspaceId, "read");
    const registry = await getRegistry();
    const canViewAll = workspace.role === "owner" || workspace.role === "admin";
    const rows = (await registry.listJevDecisions(workspaceId, canViewAll ? { limit: 100 } : { limit: 100, userId: user.id }));
    return Response.json({
      workspaceId,
      daily: (await registry.listJevDailyStats(workspaceId)),
      decisions: rows.map((decision) => ({ ...decision, can_view_text: decision.user_id === user.id })),
    });
  });
}
