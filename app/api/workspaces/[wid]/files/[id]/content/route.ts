import { authResponse, requireUser } from "@/lib/auth";
import { getRegistry } from "@/lib/relay";
import { getMediaFile, mediaFileStreamResponse } from "@/lib/relay/files";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string; id: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const { wid, id } = await params;
    const workspaceId = Number(wid);
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) return Response.json({ error: "invalid workspace id" }, { status: 400 });
    await requireWorkspacePermission(user.id, workspaceId, "read");
    const registry = await getRegistry();
    const file = await getMediaFile(registry.database, id, workspaceId);
    if (!file) return Response.json({ error: "file not found" }, { status: 404 });
    try { return await mediaFileStreamResponse(file, new URL(request.url).searchParams.get("download") === "1", request.headers.get("range")); }
    catch { return Response.json({ error: "file unavailable" }, { status: 500 }); }
  });
}
