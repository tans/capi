import { authResponse, requireUser } from "@/lib/auth";
import { getRegistry } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ wid: string }> }) {
  return authResponse(async () => {
    const user = await requireUser(request);
    const wid = Number((await params).wid);
    if (!Number.isInteger(wid) || wid <= 0) return Response.json({ error: "invalid workspace id" }, { status: 400 });
    const workspace = await requireWorkspacePermission(user.id, wid, "read");
    const url = new URL(request.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 1), 365);
    const requestedKeyId = url.searchParams.get("keyId");
    const registry = await getRegistry();
    const keys = (await registry.listKeys()).filter((key) => key.workspaceId === wid);
 const allowedKeys = keys.filter((key) => (workspace.role !== "member" || key.userId === user.id) && (!requestedKeyId || String(key.id) === requestedKeyId));
    const keyIds = new Set(allowedKeys.map((key) => key.id));
    const records = (await registry.listUsage({ days })).filter((record) => keyIds.has(record.keyId));
    const byModel = new Map<string, { requests: number; tokens: number; quota: number }>();
    for (const record of records) {
      const row = byModel.get(record.model) ?? { requests: 0, tokens: 0, quota: 0 };
      row.requests += 1; row.tokens += record.promptTokens + record.completionTokens; row.quota += record.quota; byModel.set(record.model, row);
    }
    return Response.json({ workspaceId: wid, days, scope: workspace.role === "member" ? "member" : "workspace", totalRequests: records.length, totalTokens: records.reduce((n, r) => n + r.promptTokens + r.completionTokens, 0), totalQuota: records.reduce((n, r) => n + r.quota, 0), models: [...byModel.entries()].map(([model, value]) => ({ model, ...value })) });
  });
}
