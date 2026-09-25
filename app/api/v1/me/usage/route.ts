import { models } from "@/lib/models-data";
import { authenticateKey, getRegistry, quotaToCurrency, systemCurrency, workspaceCurrency } from "@/lib/relay";
import { getDatabase } from "@/lib/relay/store";

type UsageRow = {
  model: string;
  modality: string;
  requests: number;
  tokens: number | null;
  cost: { amount: number; currency: string };
};

/** 目录外的中转模型按 text 处理。 */
const CATALOG_MODALITY = (() => {
  const map = new Map<string, string>();
  for (const entry of models) {
    for (const variant of entry.variants) map.set(variant.id, entry.modality);
  }
  return map;
})();

/**
 * 读取调用密钥的分模型用量。
 *
 * 查询参数：
 *   - modality: video | image | text | music | audio | embeddings
 *   - days:     7 | 14 | 30，默认 14
 */
export async function GET(request: Request) {
  const registry = await getRegistry();

  const auth = authenticateKey(registry, request, "billing.read");
  if (!auth.ok) return auth.response;
  const { apiKey } = auth;

  const url = new URL(request.url);
  const modality = url.searchParams.get("modality")?.toLowerCase() ?? "";
  const daysRaw = url.searchParams.get("days");
  const days = ["7", "14", "30"].includes(daysRaw ?? "") ? Number(daysRaw) : 14;

  const records = registry.listUsage({ keyId: apiKey.id, days });
  const currency = workspaceCurrency(await getDatabase(), apiKey.workspaceId, systemCurrency(registry.settings));

  // 按模型聚合
  const byModel = new Map<
    string,
    { requests: number; tokens: number; quota: number }
  >();
  for (const record of records) {
    if (!record.success) continue;
    const row = byModel.get(record.model) ?? { requests: 0, tokens: 0, quota: 0 };
    row.requests += 1;
    row.tokens += record.promptTokens + record.completionTokens;
    row.quota += record.quota;
    byModel.set(record.model, row);
  }

  let rows: UsageRow[] = [...byModel.entries()].map(([model, row]) => ({
    model,
    modality: CATALOG_MODALITY.get(model) ?? "text",
    requests: row.requests,
    tokens: row.tokens,
    cost: {
      amount: Number(quotaToCurrency(row.quota, currency).toFixed(4)),
      currency: currency.code,
    },
  }));

  if (modality && modality !== "all") {
    rows = rows.filter((r) => r.modality === modality);
  }
  rows.sort((a, b) => b.cost.amount - a.cost.amount);

  return Response.json({
    account: `key_${apiKey.id}`,
    period_days: days,
    modality: modality || null,
    source: "relay",
    totals: {
      requests: rows.reduce((s, r) => s + r.requests, 0),
      cost: {
        amount: Number(quotaToCurrency([...byModel.entries()].filter(([model]) => !modality || modality === "all" || (CATALOG_MODALITY.get(model) ?? "text") === modality).reduce((sum, [, row]) => sum + row.quota, 0), currency).toFixed(4)),
        currency: currency.code,
      },
    },
    rows,
  });
}
