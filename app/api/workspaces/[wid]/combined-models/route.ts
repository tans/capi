import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getWorkspaceJevSettings } from "@/lib/jev/config";
import { findCombinedModel, isTextModel, listCombinedModels, validateCombinedModel } from "@/lib/relay/combined-models";
import { getRegistry, isChannelAccessible } from "@/lib/relay";
import { getDatabase } from "@/lib/relay/store";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

type Context = { params: Promise<{ wid: string }> };

async function scope(request: Request, context: Context, action: "read" | "manage") {
  const user = await requireUser(request);
  const workspaceId = Number((await context.params).wid);
  await requireWorkspacePermission(user.id, workspaceId, action);
  return workspaceId;
}

export async function GET(request: Request, context: Context) {
  return authResponse(async () => {
    const workspaceId = await scope(request, context, "read");
    const registry = await getRegistry();
    const allowPlatform = (await registry.workspaceAllowsPlatformChannels(workspaceId));
    const availableModels = [...new Set((await registry.listChannels())
      .filter((channel) => channel.status === 1 && isChannelAccessible(channel, workspaceId, allowPlatform))
      .flatMap((channel) => channel.models))].filter(isTextModel).sort();
    return Response.json({ data: await listCombinedModels(workspaceId), availableModels });
  });
}

export async function PUT(request: Request, context: Context) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const workspaceId = await scope(request, context, "manage");
    const body = await readAuthBody(request);
    const previousName = typeof body.previousName === "string" ? body.previousName : "";
    const existing = await listCombinedModels(workspaceId);
    const registry = await getRegistry();
    const autoAlias = (await getWorkspaceJevSettings(workspaceId)).routeConfig.alias;
    const aliases = ["capi-auto", autoAlias, ...existing.map((item) => item.name)];
    const names = [...aliases.filter((alias) => alias !== previousName), ...(await registry.listChannels()).flatMap((channel) => channel.models)];
    const result = validateCombinedModel(body, names, aliases);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    const allowsPlatformChannels = await registry.workspaceAllowsPlatformChannels(workspaceId);
    const available = new Set((await registry.listChannels())
      .filter((channel) => isChannelAccessible(channel, workspaceId, allowsPlatformChannels))
      .flatMap((channel) => channel.models));
    if (result.value.models.some((model) => !available.has(model))) return Response.json({ error: "Every member must be configured on a channel accessible to this workspace." }, { status: 400 });
    if (previousName && !existing.some((item) => item.name === previousName)) return Response.json({ error: "Combined model not found." }, { status: 404 });
    if (!previousName && existing.length >= 20) return Response.json({ error: "A workspace can have at most 20 combined models." }, { status: 400 });
    const db = await getDatabase();
    await db.transaction(async () => {
      if (previousName) (await db.query("DELETE FROM combined_models WHERE workspace_id = ? AND name = ?").run(workspaceId, previousName));
      (await db.query("INSERT INTO combined_models (workspace_id, name, models, updated_at) VALUES (?, ?, ?, ?)")
        .run(workspaceId, result.value.name, JSON.stringify(result.value.models), Date.now()));
    })();
    return Response.json(result.value);
  });
}

export async function DELETE(request: Request, context: Context) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const workspaceId = await scope(request, context, "manage");
    const name = new URL(request.url).searchParams.get("name") ?? "";
    if (!name || !await findCombinedModel(workspaceId, name)) return Response.json({ error: "Combined model not found." }, { status: 404 });
    const db = await getDatabase();
    (await db.query("DELETE FROM combined_models WHERE workspace_id = ? AND name = ?").run(workspaceId, name));
    return Response.json({ ok: true });
  });
}
