import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { acceptWorkspaceInvite } from "@/lib/workspaces/service";

export async function POST(request: Request) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const body = await readAuthBody(request);
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return Response.json({ error: "token is required" }, { status: 400 });

    const accepted = await acceptWorkspaceInvite({ userId: user.id, email: user.email, token });
    if (!accepted) return Response.json({ error: "invalid or expired invite" }, { status: 404 });
    return Response.json({ ok: true, workspaceId: accepted.workspaceId });
  });
}
