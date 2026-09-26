import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getRegistry, listInput } from "@/lib/relay";
import { fetchUpstreamModels } from "@/lib/relay/discovery";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

/**
 * 渠道模型发现：用给定或已存渠道的上游信息拉取 /models（New-API 的 “Fetch from Upstream”）。
 * Next 16 的动态路由 params 是 Promise。
 */
export async function POST(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const wid = Number((await params).wid);
    await requireWorkspacePermission(user.id, wid, "manage");
    const body = await readAuthBody(request);

    const channelId = body.channelId === undefined || body.channelId === null ? undefined : Number(body.channelId);
    const registry = await getRegistry();
    const channel = channelId === undefined
      ? undefined
      : (await registry.listChannels()).find((c) => c.id === channelId && c.ownerType === "workspace" && c.workspaceId === wid);
    if (channelId !== undefined && !channel) return Response.json({ error: "channel not found" }, { status: 404 });

    const key = listInput(body.keys)[0] ?? channel?.keys[0];
    if (!key) return Response.json({ error: "Provide an API key." }, { status: 400 });

    const requestedBaseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    const baseUrl = requestedBaseUrl || channel?.baseUrl;
    if (!baseUrl) return Response.json({ error: "baseUrl is required." }, { status: 400 });

    // 渠道自带的请求头在前，显式传入的请求头覆盖它
    const headers: Record<string, string> = { ...(channel?.headers ?? {}) };
    if (body.headers && typeof body.headers === "object" && !Array.isArray(body.headers)) {
      for (const [name, value] of Object.entries(body.headers)) if (typeof value === "string") headers[name] = value;
    }

    const result = await fetchUpstreamModels({ baseUrl, key, headers });
    if (!result.ok) return Response.json({ error: result.error }, { status: 502 });
    return Response.json({ object: "list", data: result.models });
  });
}
