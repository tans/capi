import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getRegistry } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "read");
    const registry = await getRegistry();
    const data = registry.listChannels().filter((c) => c.ownerType === "workspace" && c.workspaceId === wid).map(({ keys, headers, ...channel }) => ({ ...channel, keyCount: keys.length, hasHeaders: Boolean(headers && Object.keys(headers).length) }));
    return Response.json({ object: "list", data });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "manage");
    const body = await readAuthBody(request);
    if (typeof body.name !== "string" || typeof body.baseUrl !== "string" || !Array.isArray(body.models)) return Response.json({ error: "name, baseUrl and models are required" }, { status: 400 });
    const registry = await getRegistry();
    const channel = await registry.createChannel({ name: body.name.trim(), type: "openai-compatible", baseUrl: body.baseUrl.trim(), keys: Array.isArray(body.keys) ? body.keys.filter((key): key is string => typeof key === "string") : [], multiKeyMode: "polling", models: body.models.filter((model): model is string => typeof model === "string"), groups: ["default"], priority: 0, weight: 1, status: 1, autoBan: true, ownerType: "workspace", workspaceId: wid });
    const { keys, headers, ...safe } = channel;
    return Response.json({ ...safe, keyCount: keys.length, hasHeaders: Boolean(headers && Object.keys(headers).length) }, { status: 201 });
  });
}
