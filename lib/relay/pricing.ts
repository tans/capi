/**
 * 倍率与计费。
 *
 * 对齐 New-API setting/ratio_setting：
 *   model_ratio.go   GetModelRatio / GetCompletionRatio / FormatMatchingModelName
 *   group_ratio.go   GetGroupRatio / GetGroupGroupRatio
 *   common/constants.go QuotaPerUnit
 */

import {
  QUOTA_PER_UNIT,
  type RelaySettings,
} from "./config";

export type UsageLike = {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
};

export type PriceQuote = {
  /** 按次计费（USD/次），未命中为 null */
  perCallPrice: number | null;
  modelRatio: number;
  completionRatio: number;
  cacheRatio: number;
  createCacheRatio: number;
  groupRatio: number;
  /** 实际应扣 quota */
  quota: number;
  /** 折算美元 */
  usd: number;
  /** 模型倍率未配置（使用了兜底值） */
  ratioMatched: boolean;
};

export function quotaToUsd(quota: number): number {
  return quota / QUOTA_PER_UNIT;
}

export function usdToQuota(usd: number): number {
  return Math.round(usd * QUOTA_PER_UNIT);
}

/**
 * 模型名归一化（对应 FormatMatchingModelName / RoutingMatchModelName）：
 *   1. 去掉 `@provider` 之类的后缀（gpt-4o@openai -> gpt-4o）
 *   2. gpt-4-gizmo / gpt-4o-gizmo 前缀收敛到通配 key
 */
export function formatMatchingModelName(name: string): string {
  let normalized = name.trim();
  const at = normalized.indexOf("@");
  if (at > 0) normalized = normalized.slice(0, at);
  if (normalized.startsWith("gpt-4-gizmo")) normalized = "gpt-4-gizmo-*";
  if (normalized.startsWith("gpt-4o-gizmo")) normalized = "gpt-4o-gizmo-*";
  return normalized;
}

/**
 * 带通配符的倍率查找：
 *   1. 精确命中
 *   2. key 以 `*` 结尾时按最长前缀匹配
 *   返回 undefined 表示未配置。
 */
export function matchRatio(
  table: Record<string, number>,
  name: string,
): number | undefined {
  if (name in table) return table[name];
  let best: { prefix: string; value: number } | null = null;
  for (const key of Object.keys(table)) {
    if (!key.endsWith("*")) continue;
    const prefix = key.slice(0, -1);
    if (name.startsWith(prefix) && (!best || prefix.length > best.prefix.length)) {
      best = { prefix, value: table[key] };
    }
  }
  return best?.value;
}

/** 模型倍率；未配置时返回兜底值并标记 matched=false。 */
export function getModelRatio(settings: RelaySettings, name: string) {
  const normalized = formatMatchingModelName(name);
  const ratio = matchRatio(settings.modelRatio, normalized);
  if (ratio === undefined) {
    return { ratio: settings.fallbackModelRatio, matched: false, normalized };
  }
  return { ratio, matched: true, normalized };
}

/** 是否按次计费。 */
export function getModelPrice(settings: RelaySettings, name: string): number | null {
  const normalized = formatMatchingModelName(name);
  const price = matchRatio(settings.modelPrice, normalized);
  return price === undefined ? null : price;
}

/**
 * 输出倍率：显式配置优先，未配置时按模型家族推导
 * （对应 getHardcodedCompletionModelRatio 的常用分支）。
 */
export function getCompletionRatio(settings: RelaySettings, name: string): number {
  const normalized = formatMatchingModelName(name);
  const configured = matchRatio(settings.completionRatio, normalized);
  if (configured !== undefined) return configured;

  if (normalized.endsWith("-all") || normalized.endsWith("-gizmo-*")) return 2;
  if (normalized.startsWith("gpt-4o")) return 4;
  if (/^gpt-5-\d/.test(normalized) || normalized.startsWith("gpt-5-mini") || normalized.startsWith("gpt-5-nano")) return 8;
  if (normalized.startsWith("gpt-5")) return 6;
  if (normalized.startsWith("gpt-4.5-preview")) return 2;
  if (normalized.startsWith("gpt-4-turbo")) return 3;
  if (normalized.startsWith("gemini-2.5-pro")) return 8;
  if (normalized.startsWith("gemini")) return 4;
  if (normalized.startsWith("deepseek-reasoner")) return 4;
  if (normalized.startsWith("deepseek")) return 3;
  return 1;
}

/** 缓存读取折扣，默认 1（不打折）。 */
export function getCacheRatio(settings: RelaySettings, name: string): number {
  const normalized = formatMatchingModelName(name);
  return matchRatio(settings.cacheRatio, normalized) ?? 1;
}

/** 缓存写入倍率，默认 1.25。 */
export function getCreateCacheRatio(settings: RelaySettings, name: string): number {
  const normalized = formatMatchingModelName(name);
  return matchRatio(settings.createCacheRatio, normalized) ?? 1.25;
}

/** 分组倍率；可叠加「用户分组 × 使用分组」的专属倍率。 */
export function getGroupRatio(
  settings: RelaySettings,
  userGroup: string,
  usingGroup: string,
): { ratio: number; special: boolean } {
  const special = settings.groupGroupRatio[userGroup]?.[usingGroup];
  if (special !== undefined) return { ratio: special, special: true };
  const ratio = settings.groupRatio[usingGroup];
  if (ratio !== undefined) return { ratio, special: false };
  return { ratio: settings.fallbackGroupRatio, special: false };
}

/**
 * 按实际 usage 计算应扣 quota：
 *
 *   quota = (prompt×ratio + completion×ratio×completionRatio
 *            + cached×ratio×cacheRatio + cacheCreation×ratio×createCacheRatio)
 *           × groupRatio
 *
 * 按次计费模型则直接 price × groupRatio。
 */
export function computeQuota(
  settings: RelaySettings,
  model: string,
  usage: UsageLike,
  userGroup: string,
  usingGroup: string,
): PriceQuote {
  const { ratio: modelRatio, matched: ratioMatched } = getModelRatio(settings, model);
  const completionRatio = getCompletionRatio(settings, model);
  const cacheRatio = getCacheRatio(settings, model);
  const createCacheRatio = getCreateCacheRatio(settings, model);
  const { ratio: groupRatio } = getGroupRatio(settings, userGroup, usingGroup);
  const perCallPrice = getModelPrice(settings, model);

  let quota: number;
  if (perCallPrice !== null) {
    quota = Math.round(perCallPrice * QUOTA_PER_UNIT * groupRatio);
  } else {
    const cached = usage.cachedTokens ?? 0;
    const cacheCreation = usage.cacheCreationTokens ?? 0;
    const prompt = Math.max(0, usage.promptTokens - cached);
    const completion = usage.completionTokens;
    quota = Math.round(
      (prompt * modelRatio +
        completion * modelRatio * completionRatio +
        cached * modelRatio * cacheRatio +
        cacheCreation * modelRatio * createCacheRatio) *
        groupRatio,
    );
  }

  return {
    perCallPrice,
    modelRatio,
    completionRatio,
    cacheRatio,
    createCacheRatio,
    groupRatio,
    quota,
    usd: quotaToUsd(quota),
    ratioMatched,
  };
}

/**
 * 预扣费额度（对应 ModelPriceHelper 的 preConsumedQuota）：
 * 以 max(promptTokens, preConsumedQuota) + max_tokens 为估算量。
 */
export function estimatePreConsumeQuota(
  settings: RelaySettings,
  model: string,
  promptTokens: number,
  maxTokens: number | null,
  userGroup: string,
  usingGroup: string,
): { quota: number; free: boolean; quote: PriceQuote } {
  const quote = computeQuota(
    settings,
    model,
    {
      // Input and output have different prices. Do not charge the output
      // budget as input tokens; this was materially under-reserving models
      // whose completion ratio is greater than one.
      promptTokens: Math.max(0, promptTokens, settings.preConsumedQuota),
      completionTokens: Math.max(0, maxTokens ?? 0),
    },
    userGroup,
    usingGroup,
  );
  return { quota: quote.quota, free: quote.quota === 0, quote };
}

/** 粗估 token 数：中文约 2 字符/token，英文约 4 字符/token，取 4 保守偏大。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}
