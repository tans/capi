import { QUOTA_PER_UNIT } from "./config";
import { RelayError } from "./errors";
import { formatMatchingModelName } from "./pricing";
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
  "llm.chat", "llm.embed", "image.generate", "video.generate",
  "music.generate", "audio.generate", "billing.read",
] as const;
export type OperationScope = (typeof OPERATION_SCOPES)[number];

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

/** 解析 key：剥离 sk- 前缀，识别末尾 `-<channelId>` 渠道指定后缀。 */
export function parseKey(raw: string): { key: string; pinChannelId: number | null } {
  const value = raw.trim().replace(/^sk-/, "");
  const pinned = /^(.*)-(\d+)$/.exec(value);
  if (!pinned) return { key: value, pinChannelId: null };
  return { key: pinned[1], pinChannelId: Number(pinned[2]) };
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

  // 额度：非无限额度且余额 <= 0 时拒绝
  if (!apiKey.unlimitedQuota && apiKey.remainQuota <= 0) {
    return {
      ok: false,
      response: quotaResponse(`API key 「${apiKey.name}」 has run out of quota.`),
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

/** 请求前额度预扣；额度不足直接抛 429。 */
export function preConsumeQuota(apiKey: ApiKey, quota: number): void {
  if (apiKey.unlimitedQuota || quota <= 0) return;
  if (apiKey.remainQuota < quota) {
    throw new RelayError(
      `Insufficient quota: need $${(quota / QUOTA_PER_UNIT).toFixed(4)}, remain $${(apiKey.remainQuota / QUOTA_PER_UNIT).toFixed(4)}.`,
      { statusCode: 429, code: "quota_exceeded", type: "quota_error" },
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

function quotaResponse(message: string) {
  return Response.json(
    { error: { type: "quota_error", code: "quota_exceeded", message, param: null } },
    { status: 429 },
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
