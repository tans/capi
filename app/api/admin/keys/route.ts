import { requireAdmin } from "@/lib/relay/admin";
import { getRegistry, quotaToUsd, usdToQuota } from "@/lib/relay";
import type { ApiKeyStatus } from "@/lib/relay/types";

/**
 * 密钥管理：GET 列表（脱敏）/ POST 新建。
 */
export async function GET(request: Request) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const registry = await getRegistry();
  return Response.json({
    object: "list",
    data: registry.listKeys().map((key) => ({
      ...key,
      key: `${key.key.slice(0, 8)}****${key.key.slice(-4)}`,
      remain_usd: key.unlimitedQuota
        ? null
        : Number(quotaToUsd(key.remainQuota).toFixed(4)),
      used_usd: Number(quotaToUsd(key.usedQuota).toFixed(4)),
    })),
  });
}

type KeyCreateBody = {
  name: string;
  group?: string;
  remainQuota?: number;
  remainUsd?: number;
  unlimitedQuota?: boolean;
  expiredTime?: number;
  modelLimitsEnabled?: boolean;
  modelLimits?: string[] | string;
  allowIps?: string[] | string;
  autoGroups?: string[] | string;
  crossGroupRetry?: boolean;
  status?: ApiKeyStatus;
};

export async function POST(request: Request) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  let body: KeyCreateBody;
  try {
    body = (await request.json()) as KeyCreateBody;
  } catch {
    return badRequest("Body must be JSON.");
  }
  if (!body.name) return badRequest("`name` is required.");

  const remainQuota = body.unlimitedQuota
    ? 0
    : body.remainUsd !== undefined
      ? usdToQuota(body.remainUsd)
      : (body.remainQuota ?? usdToQuota(10));

  const registry = await getRegistry();
  const apiKey = await registry.createKey({
    userId: 1,
    name: body.name,
    key: `capi_sk_live_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    status: body.status ?? 1,
    group: body.group ?? "default",
    modelLimitsEnabled: body.modelLimitsEnabled ?? false,
    modelLimits: toArray(body.modelLimits),
    allowIps: toArray(body.allowIps),
    remainQuota,
    unlimitedQuota: body.unlimitedQuota ?? false,
    expiredTime: body.expiredTime ?? -1,
    crossGroupRetry: body.crossGroupRetry ?? false,
    autoGroups: toArray(body.autoGroups),
  });

  // 创建时返回一次完整密钥（之后只脱敏展示）
  return Response.json(apiKey, { status: 201 });
}

function toArray(value: string[] | string | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean);
  return value
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function badRequest(message: string) {
  return Response.json(
    { error: { type: "invalid_request_error", message, param: null } },
    { status: 400 },
  );
}
