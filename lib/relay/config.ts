/**
 * 中转运行参数与价格倍率配置。
 *
 * 对齐 New-API：
 *   common/constants.go                       -> QuotaPerUnit / PreConsumedQuota
 *   setting/operation_setting/status_code_ranges.go -> 重试与自动禁用的状态码区间
 *   setting/ratio_setting/*.go                -> 各类倍率
 */

/** 1 USD = 500000 quota（1 ratio 单位 = $0.002 / 1K tokens） */
export const QUOTA_PER_UNIT = 500_000;

/**
 * 倍率表前缀说明：
 *   modelRatio      输入倍率（相对 $0.002/1K tokens）
 *   completionRatio 输出倍率（相对输入倍率的倍数）
 *   cacheRatio      命中缓存的输入折扣
 *   createCacheRatio 写缓存的价格倍数
 *   modelPrice      按次计费（USD/次），用于图像/视频/音频这类非 token 模型；
 *                   命中后不再使用 token 倍率
 */
export type RelaySettings = {
  /** 最大重试次数（0 表示只打一次，不换渠道） */
  retryTimes: number;
  /** 命中这些状态码区间才重试 */
  retryStatusRanges: [number, number][];
  /** 无论区间如何都绝不重试的状态码 */
  alwaysSkipRetryStatusCodes: number[];
  /** 是否开启失败自动禁用渠道 */
  autoDisableEnabled: boolean;
  /** 命中这些状态码区间自动禁用渠道 */
  autoDisableStatusRanges: [number, number][];
  /** 错误内容命中这些关键词也自动禁用 */
  autoDisableKeywords: string[];
  /** 预扣费时的最小 token 数 */
  preConsumedQuota: number;
  /** 上游请求超时（毫秒） */
  requestTimeoutMs: number;
  /** 未配置倍率的模型使用的兜底倍率（New-API 为 37.5） */
  fallbackModelRatio: number;
  /** 指定平台 Jev 评估渠道；null 表示按现有路由自动选择。 */
  jevChannelId: number | null;
  /** 兜底分组倍率 */
  fallbackGroupRatio: number;
  modelRatio: Record<string, number>;
  completionRatio: Record<string, number>;
  cacheRatio: Record<string, number>;
  createCacheRatio: Record<string, number>;
  /** 分组倍率：分组 -> 倍率 */
  groupRatio: Record<string, number>;
  /** 分组叠加倍率：用户分组 -> 使用分组 -> 倍率（优先于 groupRatio） */
  groupGroupRatio: Record<string, Record<string, number>>;
  /** 按次计费模型：模型名 -> USD/次 */
  modelPrice: Record<string, number>;
};

/**
 * 默认重试区间，与 New-API 的 AutomaticRetryStatusCodeRanges 一致：
 * 1xx、3xx、4xx（除 400/408）、5xx（除 504/524）会重试，2xx 不重试。
 */
const DEFAULT_RETRY_RANGES: [number, number][] = [
  [100, 199],
  [300, 399],
  [401, 407],
  [409, 499],
  [500, 503],
  [505, 523],
  [525, 599],
];

/** 默认模型倍率（节选，站点自有模型可在管理接口里追加） */
const DEFAULT_MODEL_RATIO: Record<string, number> = {
  "gpt-4": 15,
  "gpt-4o": 1.25,
  "gpt-4o-mini": 0.075,
  "gpt-4.1": 1,
  "gpt-4.1-mini": 0.2,
  "gpt-4.1-nano": 0.05,
  "gpt-5": 0.625,
  "gpt-5-mini": 0.125,
  "gpt-5-nano": 0.025,
  "gpt-5.5": 2.5,
  "gpt-5.6-sol": 2.5,
  "gpt-5.6-terra": 1.25,
  "gpt-5.6-luna": 0.5,
  o1: 7.5,
  "o1-mini": 0.55,
  o3: 1,
  "o3-mini": 0.55,
  "o4-mini": 0.55,
  "claude-opus-5": 2.5,
  "claude-sonnet-5": 1.25,
  "claude-haiku-5": 0.25,
  "gemini-3-pro": 1.25,
  "gemini-3-flash": 0.15,
  "deepseek-chat": 0.25,
  "deepseek-reasoner": 0.7,
  "text-embedding-4-large": 0.02,
  "text-embedding-4-small": 0.005,
};

/** 默认输出倍率（补全倍率），未命中时按规则推导，见 pricing.ts */
const DEFAULT_COMPLETION_RATIO: Record<string, number> = {
  "gpt-4o": 4,
  "gpt-4o-mini": 4,
  "gpt-5": 8,
  "gpt-5-mini": 8,
  "gpt-5-nano": 8,
  "gpt-5.5": 6,
  "gpt-5.6-sol": 6,
  "gpt-5.6-terra": 6,
  "gpt-5.6-luna": 6,
  "gemini-3-pro": 6,
  "gemini-3-flash": 4,
  "claude-opus-5": 5,
  "claude-sonnet-5": 5,
  "claude-haiku-5": 5,
};

/** 默认缓存读取折扣 */
const DEFAULT_CACHE_RATIO: Record<string, number> = {
  "gpt-4o": 0.5,
  "gpt-5": 0.1,
  "deepseek-chat": 0.25,
  "claude-opus-5": 0.1,
  "claude-sonnet-5": 0.1,
  "claude-haiku-5": 0.1,
};

/** 默认缓存写入倍率 */
const DEFAULT_CREATE_CACHE_RATIO: Record<string, number> = {
  "claude-opus-5": 1.25,
  "claude-sonnet-5": 1.25,
  "claude-haiku-5": 1.25,
};

/** 默认分组倍率 */
const DEFAULT_GROUP_RATIO: Record<string, number> = {
  default: 1,
  vip: 1,
  svip: 1,
};

/** 按次计费（USD/次），覆盖图像/视频/音频/音乐类模型 */
const DEFAULT_MODEL_PRICE: Record<string, number> = {
  "gpt-image-2-text-to-image": 0.03,
  "kling-v3-turbo-text-to-video": 0.07,
  "veo-3.1-text-to-video": 0.35,
  "suno-v5.5": 0.18,
  "elevenlabs-tts-v3": 0.04,
};

export const defaultSettings: RelaySettings = {
  retryTimes: 1,
  retryStatusRanges: DEFAULT_RETRY_RANGES,
  alwaysSkipRetryStatusCodes: [504, 524],
  autoDisableEnabled: true,
  autoDisableStatusRanges: [[401, 401]],
  autoDisableKeywords: ["invalid api key", "insufficient_quota", "无可用渠道"],
  preConsumedQuota: 500,
  requestTimeoutMs: 120_000,
  fallbackModelRatio: 37.5,
  jevChannelId: null,
  fallbackGroupRatio: 1,
  modelRatio: DEFAULT_MODEL_RATIO,
  completionRatio: DEFAULT_COMPLETION_RATIO,
  cacheRatio: DEFAULT_CACHE_RATIO,
  createCacheRatio: DEFAULT_CREATE_CACHE_RATIO,
  groupRatio: DEFAULT_GROUP_RATIO,
  groupGroupRatio: {},
  modelPrice: DEFAULT_MODEL_PRICE,
};

/** 运行时可调的环境变量覆盖（不落盘）。 */
export function envOverrides(): Partial<RelaySettings> {
  const overrides: Partial<RelaySettings> = {};
  const retry = process.env.CAPI_RELAY_RETRY_TIMES;
  if (retry !== undefined && Number.isFinite(Number(retry))) {
    overrides.retryTimes = Math.max(0, Number(retry));
  }
  const timeout = process.env.CAPI_RELAY_TIMEOUT_MS;
  if (timeout !== undefined && Number.isFinite(Number(timeout))) {
    overrides.requestTimeoutMs = Math.max(1000, Number(timeout));
  }
  return overrides;
}

/** SQLite path; relative paths resolve from the application working directory. */
export const DB_PATH = process.env.CAPI_DB_PATH ?? "data/capi.sqlite";

/** Optional machine/bootstrap management token; no development-mode bypass. */
export const ADMIN_TOKEN = process.env.CAPI_ADMIN_TOKEN ?? "";
