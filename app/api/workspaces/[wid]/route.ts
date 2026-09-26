import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/relay/store";
import { getRegistry, systemCurrency, validCurrency } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";
import { getWorkspaceJevSettings, updateWorkspaceJevSettings } from "@/lib/jev/config";
import { findCombinedModel } from "@/lib/relay/combined-models";

async function workspaceId(params: Promise<{ wid: string }>) {
  const id = Number((await params).wid);
  if (!Number.isInteger(id) || id <= 0) throw new Error("invalid workspace id");
  return id;
}

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const id = await workspaceId(params);
    return Response.json({ ...(await requireWorkspacePermission(user.id, id, "read")), systemCurrency: systemCurrency(await (await getRegistry()).getSettings()), jev: await getWorkspaceJevSettings(id) });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const id = await workspaceId(params);
    await requireWorkspacePermission(user.id, id, "manage");
    const body = await readAuthBody(request);
    const name = body.name === undefined ? undefined : typeof body.name === "string" ? body.name.trim() : "";
    const allowPlatformChannels = body.allowPlatformChannels;
    const jevAutoRoutingEnabled = body.jevAutoRoutingEnabled;
    const jevSecurityAuditEnabled = body.jevSecurityAuditEnabled;
    const routeConfig = body.routeConfig;
    const displayCurrency = body.displayCurrency;
    if (displayCurrency !== undefined && displayCurrency !== null && !validCurrency(displayCurrency)) return Response.json({ error: "displayCurrency requires a three-letter code, non-empty symbol (up to 8 characters), and positive rate per USD" }, { status: 400 });
    if (jevAutoRoutingEnabled !== undefined && typeof jevAutoRoutingEnabled !== "boolean") return Response.json({ error: "jevAutoRoutingEnabled must be a boolean" }, { status: 400 });
    if (jevSecurityAuditEnabled !== undefined && typeof jevSecurityAuditEnabled !== "boolean") return Response.json({ error: "jevSecurityAuditEnabled must be a boolean" }, { status: 400 });
    if (routeConfig !== undefined && (!routeConfig || typeof routeConfig !== "object" || Array.isArray(routeConfig))) return Response.json({ error: "routeConfig must be an object" }, { status: 400 });
    if (routeConfig && typeof (routeConfig as Record<string, unknown>).alias === "string" && await findCombinedModel(id, (routeConfig as Record<string, string>).alias)) return Response.json({ error: "Routing alias conflicts with a combined model." }, { status: 400 });
    if (name !== undefined && (!name || name.length > 100)) return Response.json({ error: "name must contain 1–100 characters" }, { status: 400 });
    if (allowPlatformChannels !== undefined && typeof allowPlatformChannels !== "boolean") return Response.json({ error: "allowPlatformChannels must be a boolean" }, { status: 400 });
    const db = await getDatabase();
    if (name !== undefined) (await db.query("UPDATE workspaces SET name = ? WHERE id = ?").run(name, id));
    if (allowPlatformChannels !== undefined) (await db.query("UPDATE workspaces SET allow_platform_channels = ? WHERE id = ?").run(Number(allowPlatformChannels), id));
    if (displayCurrency !== undefined) {
      const currency = displayCurrency === null ? null : displayCurrency;
      (await db.query("UPDATE workspaces SET display_currency = ?, display_symbol = ?, display_rate = ? WHERE id = ?")
        .run(currency?.code ?? null, currency?.symbol ?? null, currency?.rate ?? null, id));
    }
    if (jevAutoRoutingEnabled !== undefined || jevSecurityAuditEnabled !== undefined || routeConfig !== undefined) {
      await updateWorkspaceJevSettings(id, { ...(jevAutoRoutingEnabled === undefined ? {} : { autoRoutingEnabled: jevAutoRoutingEnabled }), ...(jevSecurityAuditEnabled === undefined ? {} : { securityAuditEnabled: jevSecurityAuditEnabled }), ...(routeConfig === undefined ? {} : { routeConfig: routeConfig as never }) });
    }
    return Response.json({ ...(await requireWorkspacePermission(user.id, id, "read")), systemCurrency: systemCurrency(await (await getRegistry()).getSettings()), jev: await getWorkspaceJevSettings(id) });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ wid: string }> }) { return authResponse(async () => { requireSameOrigin(request); const user = await requireUser(request); const id = await workspaceId(params); const workspace = await requireWorkspacePermission(user.id, id, "manage"); if (workspace.role !== "owner" || workspace.kind === "personal") return Response.json({ error: "only team owners can delete a team workspace" }, { status: 403 }); const db = await getDatabase(); const owners = (await db.query<{count:number},[number]>("SELECT count(*) as count FROM workspace_members WHERE workspace_id=? AND role='owner' AND status='active'").get(id))?.count ?? 0; if (owners < 1) return Response.json({ error: "workspace must retain an owner" }, { status: 409 }); (await db.query("UPDATE workspaces SET status='deleted' WHERE id=?").run(id)); return Response.json({ ok: true }); }); }
