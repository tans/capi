import { authResponse, requireSameOrigin, requireUser } from "@/lib/auth";
import { getRegistry } from "@/lib/relay";
import { deleteMediaFile } from "@/lib/relay/files";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function DELETE(request: Request, { params }: { params: Promise<{ wid: string; id: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const { wid, id } = await params;
    const workspaceId = Number(wid);
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) return Response.json({ error: "invalid workspace id" }, { status: 400 });
    await requireWorkspacePermission(user.id, workspaceId, "manage");
    const registry = await getRegistry();
    if (!await deleteMediaFile(registry.database, id, workspaceId)) return Response.json({ error: "file not found" }, { status: 404 });
    return Response.json({ ok: true });
  });
}
