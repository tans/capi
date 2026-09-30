// Frontend-only legacy settings contract. Runtime configuration belongs in Go.
export type RelaySettings = {
  /** 系统对外展示与输入金额使用的计价货币；内部 quota 仍以 USD 为锚点。 */
  pricingCurrency: { code: string; symbol: string; rate: number };
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
  /** 按秒计费视频模型：模型名 -> USD/秒 */
  videoPricePerSecond: Record<string, number>;
  /** 直接价格（USD/百万 token）；命中后优先于旧倍率配置。 */
  inputPrice: Record<string, number>;
  outputPrice: Record<string, number>;
  /** 缓存输入价格；未配置时沿用 inputPrice。 */
  cacheInputPrice: Record<string, number>;
};
