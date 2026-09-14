import { authResponse, requireSameOrigin, requireUser } from "@/lib/auth";
import { getRegistry } from "@/lib/relay";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request, "keys:manage");
    const id = Number((await params).id);
    if (!Number.isInteger(id)) return Response.json({ error: "invalid id" }, { status: 400 });
    const key = (await getRegistry()).getKey(id);
    if (!key || key.userId !== user.id) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ error: "Key secrets are only available at creation; rotate this key if lost." }, { status: 410 });
  });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request); const user = await requireUser(request, "keys:manage"); const id = Number((await params).id);
    if (!Number.isInteger(id)) return Response.json({ error: "invalid id" }, { status: 400 });
    const registry = await getRegistry(); const key = registry.getKey(id);
    if (!key || key.userId !== user.id) return Response.json({ error: "not found" }, { status: 404 });
    await registry.deleteKey(id); return new Response(null, { status: 204 });
  });
}
