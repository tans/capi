import { requireAdmin } from "@/lib/relay/admin";
import { getRegistry, quotaToCurrency, systemCurrency } from "@/lib/relay";

/**
 * 管理端总览：渠道计数、分组模型数、用量统计、当前设置。
 */
export async function GET(request: Request) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const registry = await getRegistry();
  const channels = registry.listChannels();
  const settings = registry.settings;

  const groups = new Map<string, number>();
  for (const channel of channels) {
    if (channel.status !== 1) continue;
    for (const group of channel.groups) {
      // Disabled groups are excluded from the routing index, so they report no models.
      const models = registry.groupModels(group).length;
      if (models) groups.set(group, models);
    }
  }

  const usage = registry.listUsage();
  const since24h = Date.now() - 24 * 60 * 60 * 1000;
  const last24h = usage.filter((r) => r.createdAt >= since24h);

  return Response.json({
    channels: {
      total: channels.length,
      enabled: channels.filter((c) => c.status === 1).length,
      autoDisabled: channels.filter((c) => c.status === 2).length,
    },
    groups: Object.fromEntries(groups),
    usage: {
      total_requests: usage.length,
      requests_24h: last24h.length,
      quota_24h: last24h.reduce((s, r) => s + r.quota, 0),
      amount_24h: Number(quotaToCurrency(last24h.reduce((s, r) => s + r.quota, 0), systemCurrency(settings)).toFixed(4)),
      currency: systemCurrency(settings).code,
    },
    settings: {
      retryTimes: settings.retryTimes,
      autoDisableEnabled: settings.autoDisableEnabled,
      requestTimeoutMs: settings.requestTimeoutMs,
      fallbackModelRatio: settings.fallbackModelRatio,
      groupRatio: settings.groupRatio,
      pricingCurrency: systemCurrency(settings),
    },
  });
}
