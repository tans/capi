import { authResponse, requireUser } from "@/lib/auth";
import { getRegistry } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string; id: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const { wid, id } = await params;
    const workspaceId = Number(wid);
    const decisionId = Number(id);
    if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0 || !Number.isSafeInteger(decisionId) || decisionId <= 0) {
      return Response.json({ error: "invalid id" }, { status: 400 });
    }
    await requireWorkspacePermission(user.id, workspaceId, "read");
    const registry = await getRegistry();
    const text = (await registry.getJevDecisionText(workspaceId, decisionId, user.id));
    if (text === undefined) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ original_text: text });
  });
}
