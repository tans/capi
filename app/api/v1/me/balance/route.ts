import { authenticateKey, getRegistry, quotaToUsd } from "@/lib/relay";

/** 当前密钥的额度余额（quota -> USD）。 */
export async function GET(request: Request) {
  const registry = await getRegistry();

  const auth = authenticateKey(registry, request, "billing.read");
  if (!auth.ok) return auth.response;
  const { apiKey } = auth;

  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const records = registry
    .listUsage({ keyId: apiKey.id })
    .filter((r) => r.createdAt >= since);
  const spend = records.reduce((sum, r) => sum + r.quota, 0);

  return Response.json({
    account: `key_${apiKey.id}`,
    key_name: apiKey.name,
    unlimited: apiKey.unlimitedQuota,
    balance: {
      amount: Number(quotaToUsd(apiKey.remainQuota).toFixed(4)),
      currency: "USD",
    },
    reserved: { amount: 0, currency: "USD" },
    period: {
      starts_at: new Date(since).toISOString(),
      spend: {
        amount: Number(quotaToUsd(spend).toFixed(4)),
        currency: "USD",
      },
      requests: records.length,
    },
  });
}
