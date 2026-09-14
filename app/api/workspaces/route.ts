import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { createWorkspace, listUserWorkspaces } from "@/lib/workspaces/service";

export async function GET(request: Request) {
  return authResponse(async () => {
    const user = await requireUser(request);
    return Response.json({ object: "list", data: await listUserWorkspaces(user.id) });
  });
}

export async function POST(request: Request) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const body = await readAuthBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) return Response.json({ error: "name must contain 1–100 characters" }, { status: 400 });
    const workspace = await createWorkspace({ userId: user.id, name, kind: "team" });
    return Response.json(workspace, { status: 201 });
  });
}
