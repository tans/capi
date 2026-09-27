import { authResponse, requireUser } from "@/lib/auth";
import { getRegistry } from "@/lib/relay";
import { listMediaFiles } from "@/lib/relay/files";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const workspaceId = Number((await params).wid);
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) return Response.json({ error: "invalid workspace id" }, { status: 400 });
    await requireWorkspacePermission(user.id, workspaceId, "read");
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
    const before = Number(url.searchParams.get("before"));
    const beforeId = url.searchParams.get("before_id") ?? undefined;
    const registry = await getRegistry();
    const files = await listMediaFiles(registry.database, workspaceId, limit + 1, Number.isSafeInteger(before) && before > 0 ? before : undefined, beforeId);
    return Response.json({
      data: files.slice(0, limit).map((file) => ({
        id: file.id,
        filename: file.filename,
        contentType: file.mimeType,
        bytes: file.byteSize,
        purpose: file.purpose,
        createdAt: file.createdAt,
        expiresAt: file.expiresAt,
      })),
      hasMore: files.length > limit,
    }, { headers: { "cache-control": "no-store" } });
  });
}
