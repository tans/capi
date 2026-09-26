import type { RelaySettings } from "./config";
import type { ImageProtocolConfig } from "./image-protocol";

/**
 * 中转（relay）领域模型。
 *
 * 字段语义对齐 New-API / One-API：
 *   model/channel.go  -> Channel
 *   model/token.go    -> ApiKey（New-API 里叫 Token，这里沿用「密钥」叫法）
 *   model/ability.go  -> Ability（分组 + 模型 + 渠道 + 优先级 + 权重）
 */

/** 上游协议类型，决定请求体/路径拼接方式。 */
export type ChannelType =
  | "openai"
  | "openai-compatible"
  | "anthropic"
  | "gemini";

/** Channel types that the current OpenAI-compatible relay can execute. */
export const SUPPORTED_CHANNEL_TYPES = ["openai", "openai-compatible"] as const;

export function isSupportedChannelType(value: unknown): value is ChannelType {
  return typeof value === "string" && (SUPPORTED_CHANNEL_TYPES as readonly string[]).includes(value);
}

export function isBlockedUpstreamHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:") || /^(0|10|127)\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

/**
 * 渠道状态，取值同 New-API：
 *   1 = 启用
 *   2 = 自动禁用（请求失败被自动拉黑）
 *   3 = 手动禁用
 */
export type ChannelStatus = 1 | 2 | 3;

/** 多上游 key 的选取策略。 */
export type MultiKeyMode = "polling" | "random";
export type EvaluateProtocol = "generic" | "typesafe";

export type Channel = {
  id: number;
  name: string;
  type: ChannelType;
  /** 上游地址，例如 https://api.openai.com/v1 */
  baseUrl: string;
  /** 上游密钥，支持多 key（换行即多 key，或 JS 数组） */
  keys: string[];
  multiKeyMode: MultiKeyMode;
  /** 该渠道声明支持的模型名（对外暴露的名字，未做映射时即上游名字） */
  models: string[];
  /** 所属分组，一个渠道可以属于多个分组 */
  groups: string[];
  /** 优先级，越大越先被选中；retry 时逐级下降 */
  priority: number;
  /** 权重，仅在「同一分组 + 同一模型 + 同一优先级」内生效，0 表示等权 */
  weight: number;
  status: ChannelStatus;
  /** 失败时是否允许被自动禁用 */
  autoBan: boolean;
  /** 模型名映射：{ "对外模型名": "上游真实模型名" } */
  modelMapping?: Record<string, string>;
  /** Optional safe, declarative image request/response mapping for this channel. */
  imageProtocolConfig?: ImageProtocolConfig | null;
  /** Optional provider-specific async video endpoints; defaults to /videos and /videos/{id}. */
  videoSubmitPath?: string;
  videoStatusPath?: string;
  /** Optional provider-specific evaluation endpoint; defaults to /evaluate. */
  evaluatePath?: string;
  /** Evaluation request/response protocol used by the upstream channel. */
  evaluateProtocol?: EvaluateProtocol;
  /** 附加到上游请求的请求头，例如 { "OpenAI-Organization": "org-xxx" } */
  headers?: Record<string, string>;
  /** 强制覆盖请求体字段，例如 { temperature: 0.7 } */
  paramOverride?: Record<string, unknown>;
  /** 标签，便于按业务线筛选（预留） */
  tag?: string;
  /** Automatic-disable diagnostics, cleared when an administrator recovers the channel. */
  autoDisabledAt?: number;
  lastError?: string;
  /** 累计消耗额度（quota 单位） */
  usedQuota: number;
  /** 最近一次响应耗时（毫秒，EMA） */
  responseTime: number;
  /** 上游余额（USD，可选，仅展示） */
  balance?: number;
  createdTime: number;
  testTime?: number;
  /** Platform channels have no workspace; workspace channels must have one. */
  ownerType: "platform" | "workspace";
  workspaceId?: number;
};
/** 密钥状态：1 启用 / 2 禁用 / 3 过期禁用。 */
export type ApiKeyStatus = 1 | 2 | 3;

export type ApiKey = {
  id: number;
  userId: number;
  /** Owning workspace. Every callable key belongs to exactly one workspace. */
  workspaceId: number;
  name: string;
  /** Display prefix for persisted objects; raw credential on create/rotate results. */
  key: string;
  /** Raw credential retained for the workspace key manager's explicit reveal action. */
  secret?: string;
  status: ApiKeyStatus;
  /** 分组：决定能命中哪些渠道（空串表示跟随用户默认分组 default） */
  group: string;
  /** 是否启用模型白名单 */
  modelLimitsEnabled: boolean;
  /** 模型白名单 */
  modelLimits: string[];
  /** Operation grants for this user's API key. */
  scopes?: string[];
  /** IP 白名单，支持精确 IP 与 CIDR，空数组表示不限制 */
  allowIps: string[];
  /** NULL means no per-key budget cap; wallet funds remain mandatory. */
  budgetLimitQuota: number | null;
  budgetSpentQuota: number;
  /** 过期时间（毫秒时间戳），-1 表示永不过期 */
  expiredTime: number;
  createdTime: number;
  accessedTime: number;
  /** auto 分组时是否跨分组重试 */
  crossGroupRetry: boolean;
  /** auto 分组的可选分组列表 */
  autoGroups: string[];
};

/** 分组状态：1 启用 / 2 停用（停用后不参与路由，配置保留）。 */
export type GroupStatus = 1 | 2;

/**
 * 中转分组：路由与计费的逻辑单元。
 * 渠道订阅分组（Channel.groups），密钥选择分组（ApiKey.group），
 * 倍率与启停由分组自身维护，渠道与密钥按 name 引用。
 */
export type Group = {
  id: number;
  /** 不可变的小写标识，渠道与密钥按它引用分组 */
  name: string;
  displayName: string;
  /** 计费倍率 */
  ratio: number;
  description: string;
  status: GroupStatus;
  createdAt: number;
};

/**
 * 能力表：一个「分组 + 模型 + 渠道」的可路由关系。
 * 由 Channel 展开而来，等价于 New-API 的 abilities 表。
 */
export type Ability = {
  group: string;
  model: string;
  channelId: number;
  enabled: boolean;
  priority: number;
  weight: number;
  tag?: string;
};

export type UsageRecord = {
  id: string;
  requestId: string;
  createdAt: number;
  keyId: number;
  keyName: string;
  channelId: number | null;
  channelName: string;
  group: string;
  model: string;
  /** 对外请求的模型名 */
  requestModel: string;
  /** 打向上游的模型名（模型映射之后） */
  upstreamModel: string;
  stream: boolean;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  /** 本次实际扣费额度（quota 单位） */
  quota: number;
  /** 重试次数 */
  retry: number;
  /** 首个字节耗时（毫秒） */
  firstByteMs: number;
  /** 总耗时（毫秒） */
  durationMs: number;
  success: boolean;
  statusCode: number;
  errorMessage?: string;
  purpose?: "inference" | "jev_evaluation";
};

/** Consistent read snapshot of the SQLite-backed registry. */
export type RelayData = {
  version: number;
  channels: Channel[];
  keys: ApiKey[];
  usage: UsageRecord[];
  /** 覆盖默认设置的项 */
  settings: Partial<RelaySettings>;
  seq: { channel: number; key: number };
};
