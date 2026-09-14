import { models } from "@/lib/models-data";
import { authenticateKey, effectiveGroup, getRegistry } from "@/lib/relay";

/**
 * 列出调用密钥可用的模型。
 *
 * 返回路由表中该分组实际配置的模型，并按密钥模型白名单过滤。
 * 未配置渠道时返回空列表，不以站点目录代替可用模型。
 */
export async function GET(request: Request) {
  const registry = await getRegistry();

  const auth = authenticateKey(registry, request);
  if (!auth.ok) return auth.response;
  const { apiKey } = auth;

  const url = new URL(request.url);
  const modality = url.searchParams.get("modality");
  const provider = url.searchParams.get("provider");

  // 目录元信息：模型 id -> 家族条目
  const catalog = new Map<string, (typeof models)[number]>();
  for (const entry of models) {
    for (const variant of entry.variants) {
      catalog.set(variant.id, entry);
    }
  }

  const group = effectiveGroup(apiKey);
  const routedModels = registry.groupModels(group);

  // 密钥模型白名单（含通配）
  const allowList =
    apiKey.modelLimitsEnabled && apiKey.modelLimits.length > 0
      ? apiKey.modelLimits
      : null;
  const isAllowed = (id: string) => {
    if (!allowList) return true;
    return (
      allowList.includes(id) ||
      allowList.some((m) => m.endsWith("*") && id.startsWith(m.slice(0, -1)))
    );
  };

  const data = routedModels
    .filter(isAllowed)
    .filter((id) => {
      const entry = catalog.get(id);
      if (!entry) return true; // 目录外的模型也列出（自建渠道常见）
      if (modality && entry.modality !== modality) return false;
      if (
        provider &&
        entry.provider.toLowerCase() !== provider.toLowerCase()
      ) {
        return false;
      }
      return true;
    })
    .map((id) => {
      const entry = catalog.get(id);
      if (!entry) {
        // 渠道声明但目录没有的模型
        return { id, object: "model", owned_by: group };
      }
      return {
        id,
        object: "model",
        owned_by: group,
        family: entry.slug,
        provider: entry.provider,
        modality: entry.modality,
        capabilities: entry.capabilities,
        price: {
          amount: Number.parseFloat(entry.priceFrom.amount),
          unit: entry.priceFrom.unit,
          currency: "USD",
        },
      };
    });

  if (isAllowed("capi-auto") && !modality && !provider) {
    data.unshift({ id: "capi-auto", object: "model", owned_by: group });
  }

  return Response.json({
    object: "list",
    group,
    source: "relay",
    data,
  });
}
