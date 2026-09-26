import { getDatabase } from "../relay/store";
import type { AutoRouteConfig, WorkspaceJevSettings } from "./types";

const defaultProfiles = {
  chat: { light: "gpt-4o-mini", standard: "gpt-4o", advanced: "gpt-5.5" },
  code: { light: "gpt-4o-mini", standard: "gpt-5.5", advanced: "gpt-5.5" },
  analysis: { light: "gpt-4o-mini", standard: "gpt-4o", advanced: "gpt-5.5" },
  sensitive: { standard: "gpt-5.5" },
  media: { standard: "gpt-4o" },
  other: { standard: "gpt-4o" },
} satisfies AutoRouteConfig["profiles"];

export const DEFAULT_AUTO_ROUTE_CONFIG: AutoRouteConfig = {
  alias: "capi-auto",
  profiles: defaultProfiles,
  fallback: { intent: "other", complexity: "standard" },
};

export const DEFAULT_WORKSPACE_JEV_SETTINGS: WorkspaceJevSettings = {
  autoRoutingEnabled: false,
  securityAuditEnabled: false,
  routeConfig: DEFAULT_AUTO_ROUTE_CONFIG,
};

export async function getWorkspaceJevSettings(workspaceId: number): Promise<WorkspaceJevSettings> {
  const db = await getDatabase();
  const row = (await db.query<{ auto_routing_enabled: number; security_audit_enabled: number; route_config: string }, [number]>(
    "SELECT auto_routing_enabled, security_audit_enabled, route_config FROM workspace_jev_settings WHERE workspace_id = ?",
  ).get(workspaceId));
  return row ? {
    autoRoutingEnabled: row.auto_routing_enabled === 1,
    securityAuditEnabled: row.security_audit_enabled === 1,
    routeConfig: mergeRouteConfig(JSON.parse(row.route_config || "{}")),
  } : DEFAULT_WORKSPACE_JEV_SETTINGS;
}

function mergeRouteConfig(value: Partial<AutoRouteConfig>): AutoRouteConfig {
  return {
    ...DEFAULT_AUTO_ROUTE_CONFIG,
    ...value,
    profiles: { ...DEFAULT_AUTO_ROUTE_CONFIG.profiles, ...(value.profiles ?? {}) },
    fallback: { ...DEFAULT_AUTO_ROUTE_CONFIG.fallback, ...(value.fallback ?? {}) },
  };
}

export async function updateWorkspaceJevSettings(
  workspaceId: number,
  patch: Partial<WorkspaceJevSettings>,
): Promise<WorkspaceJevSettings> {
  const current = await getWorkspaceJevSettings(workspaceId);
  const next = { ...current, ...patch };
  const db = await getDatabase();
  (await db.query(
    `INSERT INTO workspace_jev_settings (workspace_id, auto_routing_enabled, security_audit_enabled, route_config, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id) DO UPDATE SET
       auto_routing_enabled = excluded.auto_routing_enabled,
       security_audit_enabled = excluded.security_audit_enabled,
       route_config = excluded.route_config,
       updated_at = excluded.updated_at`,
  ).run(workspaceId, Number(next.autoRoutingEnabled), Number(next.securityAuditEnabled), JSON.stringify(next.routeConfig), Date.now()));
  return next;
}
