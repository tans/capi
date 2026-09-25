import { RelayError } from "./errors";
import { formatMatchingModelName } from "./pricing";
import { currencyToQuota, formatQuota, quotaToCurrency, USD, type Currency } from "./currency";
import type { RelayRegistry } from "./store";
import type { ApiKey } from "./types";

/**
 * 密钥鉴权与额度管理。
 *
 * 对齐 New-API middleware/auth.go TokenAuth + model/token.go：
 *   - Authorization: Bearer <key>（也接受 x-api-key / ?key=）
 *   - key 允许 `sk-<key>-<channelId>` 形式：管理员可用后缀指定渠道（distributor）
 *   - 校验顺序：存在 -> 状态 -> 过期 -> IP 白名单 -> 额度
 *   - 分组：key.group 为空则用 default；分组需存在于 groupRatio，否则拒绝
 *   - 模型白名单：modelLimitsEnabled 时请求模型必须命中（含归一化名）
 */

export type AuthResult =
  | { ok: true; apiKey: ApiKey; pinnedChannelId: number | null }
  | { ok: false; response: Response };

export const OPERATION_SCOPES = [
  "llm.chat", "llm.embed", "llm.evaluate", "image.generate", "video.generate",
  "music.generate", "audio.generate", "billing.read",
] as const;
export type OperationScope = (typeof OPERATION_SCOPES)[number];

/** 密钥分组：空串表示跟随默认分组；否则必须是已存在的分组名（按名引用，大小写不敏感）。 */
export function normalizeKeyGroup(value: unknown, knownGroups: readonly string[]):
  | { ok: true; group: string }
  | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, group: "" };
  if (typeof value !== "string") return { ok: false, error: "group must be a string" };
  const group = value.trim();
  if (!group) return { ok: true, group: "" };
  const existing = knownGroups.find((name) => name.toLowerCase() === group.toLowerCase());
  if (!existing) return { ok: false, error: "Choose an existing group or leave it empty" };
  return { ok: true, group: existing };
}

export function normalizeKeyProvision(body: Record<string, unknown>, knownGroups: readonly string[] = [], currency: Currency = USD):
  | { ok: true; name: string; scopes: OperationScope[]; group: string; budgetLimitQuota: number | null }
  | { ok: false; error: string } {
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) return { ok: false, error: "name must contain 1–100 characters" };
  if (typeof body.scopes !== "string") return { ok: false, error: "scopes are required" };
  const scopes = [...new Set(body.scopes.split(",").map((scope) => scope.trim()).filter(Boolean))];
  if (!scopes.length || scopes.some((scope) => !(OPERATION_SCOPES as readonly string[]).includes(scope))) return { ok: false, error: "Choose supported operation scopes" };
  const group = normalizeKeyGroup(body.group, knownGroups);
  if (!group.ok) return group;
  if (body.budget !== undefined && typeof body.budget !== "string") return { ok: false, error: "invalid budget" };
  const budget = typeof body.budget === "string" ? body.budget.trim() : "";
  if (budget && (!/^\d+(?:\.\d{1,2})?$/.test(budget) || Number(budget) <= 0 || !Number.isSafeInteger(currencyToQuota(Number(budget), currency)))) return { ok: false, error: "budget must be a positive amount" };
  return { ok: true, name: body.name.trim(), scopes: scopes as OperationScope[], group: group.group, budgetLimitQuota: budget ? currencyToQuota(Number(budget), currency) : null };
}

/** `secret` carries the raw credential only on the create/rotate result, a display prefix otherwise. */
export function serializeApiKey(key: ApiKey, currency: Currency = USD) {
  return {
    id: String(key.id), name: key.name,
    secret: key.key,
    status: key.status,
    scopes: key.scopes ?? [],
    budget: key.budgetLimitQuota === null ? "Unlimited" : `${formatQuota(key.budgetLimitQuota, currency)} cap`,
    budgetLimit: key.budgetLimitQuota === null ? null : quotaToCurrency(key.budgetLimitQuota, currency),
    budgetSpent: quotaToCurrency(key.budgetSpentQuota, currency),
    currency: currency.code,
    /** Empty string means the key follows the default group. */
    group: key.group,
    created: new Date(key.createdTime).toISOString(), lastUsed: key.accessedTime ? new Date(key.accessedTime).toISOString() : "",
    workspaceId: key.workspaceId,
  };
}

export function isOperationAllowed(apiKey: ApiKey, operation: OperationScope): boolean {
  return apiKey.scopes === undefined || apiKey.scopes.includes(operation);
}

export function assertOperationAllowed(apiKey: ApiKey, operation: OperationScope): void {
  if (!isOperationAllowed(apiKey, operation)) {
    throw new RelayError(`API key does not grant the ${operation} scope.`, {
      statusCode: 403, code: "insufficient_scope", type: "permission_error",
    });
  }
}

/** 从请求头/查询串提取原始 key。 */
export function extractRawKey(request: Request): string {
  const url = new URL(request.url);
  let raw = "";

  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    raw = auth.slice(7).trim();
  }
  if (!raw) {
    raw = request.headers.get("x-api-key")?.trim() ?? "";
  }
  if (!raw) {
    raw = url.searchParams.get("key")?.trim() ?? "";
  }
  return raw;
}

/** Parse the credential only; ordinary callers cannot select an upstream channel. */
export function parseKey(raw: string): { key: string; pinChannelId: null } {
  return { key: raw.trim().replace(/^sk-/, ""), pinChannelId: null };
}

/** 完整鉴权：返回密钥或 401/403 响应。 */
export function authenticateKey(
  registry: RelayRegistry,
  request: Request,
  operation?: OperationScope,
): AuthResult {
  const raw = extractRawKey(request);
  if (!raw) {
    return {
      ok: false,
      response: unauthorizedResponse(
        "Missing or malformed credentials. Send the key as `Authorization: Bearer YOUR_API_TOKEN`.",
      ),
    };
  }

  const { key, pinChannelId } = parseKey(raw);
  const apiKey = registry.getKeyByKeyValue(key);
  if (!apiKey) {
    return { ok: false, response: unauthorizedResponse("Invalid API key.") };
  }

  const lifecycle = registry.database.query<{ workspace_status: string; member_status: string }, [number, number]>(
    `SELECT w.status AS workspace_status, m.status AS member_status
     FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
     WHERE w.id = ?`,
  ).get(apiKey.userId, apiKey.workspaceId);
  if (!lifecycle || lifecycle.workspace_status !== "active") {
    return { ok: false, response: forbiddenResponse("This API key's workspace is unavailable.") };
  }
  if (lifecycle.member_status !== "active") {
    return { ok: false, response: forbiddenResponse("This API key's workspace membership is inactive.") };
  }

  if (apiKey.status !== 1) {
    return {
      ok: false,
      response: forbiddenResponse(
        `API key 「${apiKey.name}」 is disabled${apiKey.status === 3 ? " (expired)" : ""}.`,
      ),
    };
  }

  if (
    apiKey.expiredTime !== -1 &&
    apiKey.expiredTime > 0 &&
    Date.now() > apiKey.expiredTime
  ) {
    return {
      ok: false,
      response: forbiddenResponse(`API key 「${apiKey.name}」 has expired.`),
    };
  }

  // IP 白名单（支持精确 IP 与 CIDR）
  if (apiKey.allowIps.length > 0) {
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "";
    if (!clientIp || !ipAllowed(clientIp, apiKey.allowIps)) {
      return {
        ok: false,
        response: forbiddenResponse("Your IP is not in the allow list of this key."),
      };
    }
  }

  if (operation && !isOperationAllowed(apiKey, operation)) {
    return {
      ok: false,
      response: Response.json({ error: {
        type: "permission_error", code: "insufficient_scope",
        message: `API key does not grant the ${operation} scope.`, param: null,
      } }, { status: 403 }),
    };
  }


  return { ok: true, apiKey, pinnedChannelId: pinChannelId };
}

/** 解析生效分组：key.group 优先，空则 default。 */
export function effectiveGroup(apiKey: ApiKey): string {
  return apiKey.group || "default";
}

/** 模型白名单校验（含归一化名回退）。 */
export function assertModelAllowed(apiKey: ApiKey, model: string): void {
  if (!apiKey.modelLimitsEnabled) return;
  const normalized = formatMatchingModelName(model);
  const allowed =
    apiKey.modelLimits.includes(model) ||
    apiKey.modelLimits.includes(normalized) ||
    // 通配白名单：modelLimits 里以 * 结尾的项
    apiKey.modelLimits.some(
      (m) => m.endsWith("*") && (model.startsWith(m.slice(0, -1)) || normalized.startsWith(m.slice(0, -1))),
    );
  if (!allowed) {
    throw new RelayError(
      `Model ${model} is not in the allow list of key 「${apiKey.name}」.`,
      { statusCode: 403, code: "model_not_found", type: "permission_error" },
    );
  }
}


// ------------------------------------------------------------------ helpers

function unauthorizedResponse(message: string) {
  return Response.json(
    { error: { type: "authentication_error", code: "invalid_api_key", message, param: null } },
    { status: 401 },
  );
}

function forbiddenResponse(message: string) {
  return Response.json(
    { error: { type: "permission_error", code: "invalid_api_key", message, param: null } },
    { status: 403 },
  );
}


/** 精确 IP 或 CIDR 匹配。 */
export function ipAllowed(ip: string, allowList: string[]): boolean {
  for (const entry of allowList) {
    const rule = entry.trim();
    if (!rule) continue;
    if (rule === ip) return true;
    if (rule.includes("/")) {
      if (ipInCidr(ip, rule)) return true;
    }
  }
  return false;
}

function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return -1;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const ipLong = ipToLong(ip);
  const baseLong = ipToLong(base);
  if (ipLong < 0 || baseLong < 0 || !Number.isFinite(bits) || bits < 0 || bits > 32) {
    return false;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipLong & mask) === (baseLong & mask);
}
