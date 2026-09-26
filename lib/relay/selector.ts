import type { RelayRegistry } from "./store";
import { formatMatchingModelName } from "./pricing";
import type { Channel } from "./types";

/**
 * 渠道选择：优先级分层 + 同层加权随机。
 *
 * 逐行对齐 New-API model/channel_cache.go 的 GetRandomSatisfiedChannel：
 *
 *   1. 候选 = abilities[group][model]（索引已按优先级降序）
 *   2. 找不到时用归一化模型名（去 @xxx 后缀）再试一次
 *   3. 无候选 -> null；仅一个 -> 直接返回
 *   4. 每次选择剩余可用渠道中的最高优先级；失败渠道由 excludeIds 排除。
 *   5. 同一优先级内按权重加权随机，带平滑系数：
 *      - 所有权重为 0：sumWeight = n*100，每个渠道有效权重 100（等权）
 *      - 平均权重 < 10：权重放大 100 倍，避免低权重渠道被过度稀释
 */

export type SelectOptions = {
  group: string;
  model: string;
  /** Retry count is retained for callers; exclusions determine fallback. */
  retry: number;
  excludeIds?: number[];
  workspaceId?: number;
  allowPlatform?: boolean;
};

export type SelectResult = {
  channel: Channel;
  /** 实际参与匹配的模型名（可能是归一化后的） */
  matchedModel: string;
  /** 本次命中的优先级层级 */
  priority: number;
  /** 同层候选数 */
  candidateCount: number;
};

/**
 * Apply the same ownership boundary everywhere a channel can be exposed.
 * Workspace-owned channels are private; platform channels require an explicit
 * workspace opt-in. Keeping this rule here prevents pinned and discovered
 * routes from drifting apart.
 */
export function isChannelAccessible(
  channel: Pick<Channel, "ownerType" | "workspaceId">,
  workspaceId: number | undefined,
  allowPlatform: boolean,
): boolean {
  if (channel.ownerType === "platform") return allowPlatform;
  return workspaceId !== undefined && channel.workspaceId === workspaceId;
}

export async function selectChannel(
  registry: RelayRegistry,
  options: SelectOptions,
): Promise<SelectResult | null> {
  const { group, model, excludeIds = [], workspaceId, allowPlatform = true } = options;
  const excluded = new Set(excludeIds);
  let ids = (await registry.candidateIds(group, model)).filter((id) => !excluded.has(id));

  let matchedModel = model;
  if (ids.length === 0) {
    const normalized = formatMatchingModelName(model);
    if (normalized !== model) {
      matchedModel = normalized;
      ids = (await registry.candidateIds(group, normalized)).filter((id) => !excluded.has(id));
    }
  }

  // 过滤后失效的渠道（可能刚好被禁用）兜底再查一次
  const loadedChannels = await Promise.all(ids.map((id) => registry.getChannel(id)));
  const channels = loadedChannels.filter((channel): channel is Channel =>
    Boolean(channel && channel.status === 1 && isChannelAccessible(channel, workspaceId, allowPlatform)),
  );
  if (channels.length === 0) return null;
  if (channels.length === 1) {
    return {
      channel: channels[0],
      matchedModel,
      priority: channels[0].priority,
      candidateCount: 1,
    };
  }

  // Failed channels are already excluded. Advancing by retry again would skip
  // healthy fallback channels (for example 30 -> 10 instead of 30 -> 20).
  const targetPriority = Math.max(...channels.map((channel) => channel.priority));

  const targetChannels = channels.filter((c) => c.priority === targetPriority);
  if (targetChannels.length === 0) return null;

  // 加权随机（含平滑），逻辑与 channel_cache.go 完全一致
  let sumWeight = targetChannels.reduce((sum, c) => sum + c.weight, 0);
  let smoothingFactor = 1;
  let smoothingAdjustment = 0;

  if (sumWeight === 0) {
    sumWeight = targetChannels.length * 100;
    smoothingAdjustment = 100;
  } else if (sumWeight / targetChannels.length < 10) {
    smoothingFactor = 100;
  }

  const totalWeight = sumWeight * smoothingFactor;
  let randomWeight = Math.floor(Math.random() * totalWeight);

  for (const channel of targetChannels) {
    randomWeight -= channel.weight * smoothingFactor + smoothingAdjustment;
    if (randomWeight < 0) {
      return {
        channel,
        matchedModel,
        priority: targetPriority,
        candidateCount: targetChannels.length,
      };
    }
  }

  // 理论上到不了这里（浮点/取整兜底：返回最后一个）
  return {
    channel: targetChannels[targetChannels.length - 1],
    matchedModel,
    priority: targetPriority,
    candidateCount: targetChannels.length,
  };
}

/**
 * 预览某「分组 + 模型」的路由拓扑：按优先级分层展示权重分布。
 * 供管理端 /api/admin/abilities 使用，也方便人工核对权重配置。
 */
export async function describeRouting(
  registry: RelayRegistry,
  group: string,
  model: string,
) {
  const layers: {
    priority: number;
    channels: { id: number; name: string; weight: number; share: number }[];
  }[] = [];

  for (const id of (await registry.candidateIds(group, model))) {
    const channel = (await registry.getChannel(id));
    if (!channel || channel.status !== 1) continue;
    let layer = layers.find((l) => l.priority === channel.priority);
    if (!layer) {
      layer = { priority: channel.priority, channels: [] };
      layers.push(layer);
    }
    layer.channels.push({
      id: channel.id,
      name: channel.name,
      weight: channel.weight,
      share: 0,
    });
  }

  for (const layer of layers) {
    const sum = layer.channels.reduce((s, c) => s + c.weight, 0);
    // 与运行时相同的平滑规则换算成「选中概率」：
    // 全 0 权重 -> 等权；平滑系数只放大数值，不改变比例
    const total = sum === 0 ? layer.channels.length * 100 : sum;
    for (const c of layer.channels) {
      const effectiveWeight = sum === 0 ? 100 : c.weight;
      c.share = total === 0 ? 1 / layer.channels.length : effectiveWeight / total;
    }
  }

  return layers;
}
