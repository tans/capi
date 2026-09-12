import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getRegistry, OPERATION_SCOPES, usdToQuota, quotaToUsd } from "@/lib/relay";
import type { ApiKey } from "@/lib/relay/types";

const allowedScopes = new Set<string>(OPERATION_SCOPES);

function serializeKey(key: ApiKey, reveal = false) {
  return {
    id: String(key.id),
    name: key.name,
    secret: reveal ? key.key : `${key.key.slice(0, 14)}${"•".repeat(8)}${key.key.slice(-4)}`,
    scopes: key.scopes ?? [],
    budget: key.unlimitedQuota ? "Unlimited" : `$${quotaToUsd(key.remainQuota).toFixed(2)}`,
    created: new Date(key.createdTime).toISOString(),
    lastUsed: key.accessedTime ? new Date(key.accessedTime).toISOString() : "",
  };
}

export async function GET(request: Request) {
  return authResponse(async () => {
    const user = await requireUser(request, "keys:manage");
    const registry = await getRegistry();
    const data = registry.listKeys().filter((key) => key.userId === user.id).map((key) => serializeKey(key));
    return Response.json({ object: "list", data });
  });
}

export async function POST(request: Request) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request, "keys:manage");
    const body = await readAuthBody(request);
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
      return Response.json({ error: "name must contain 1–100 characters" }, { status: 400 });
    }
    if (typeof body.scopes !== "string") return Response.json({ error: "scopes are required" }, { status: 400 });
    const scopes = [...new Set(body.scopes.split(",").map((scope) => scope.trim()).filter(Boolean))];
    if (!scopes.length || scopes.some((scope) => !allowedScopes.has(scope))) {
      return Response.json({ error: "Choose supported operation scopes" }, { status: 400 });
    }
    if (body.budget !== undefined && typeof body.budget !== "string") return Response.json({ error: "invalid budget" }, { status: 400 });
    const budget = (body.budget as string | undefined)?.trim() ?? "";
    if (budget && (!/^\d+(?:\.\d{1,2})?$/.test(budget) || !Number.isFinite(usdToQuota(Number(budget))) || Number(budget) <= 0)) {
      return Response.json({ error: "budget must be a positive amount" }, { status: 400 });
    }
    const registry = await getRegistry();
    const key = await registry.createKey({
      userId: user.id, name: body.name.trim(), key: `capi_sk_live_${crypto.randomUUID().replaceAll("-", "")}`,
      status: 1, group: "default", scopes, modelLimitsEnabled: false, modelLimits: [], allowIps: [],
      remainQuota: budget ? usdToQuota(Number(budget)) : 0, unlimitedQuota: !budget,
      expiredTime: -1, crossGroupRetry: false, autoGroups: [],
    });
    return Response.json(serializeKey(key, true), { status: 201 });
  });
}
