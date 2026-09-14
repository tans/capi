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

  const wallet = registry.getWorkspaceWallet(apiKey.workspaceId);
  if (!wallet) return Response.json({ error: { code: "workspace_wallet_not_found", message: "Workspace wallet is unavailable." } }, { status: 503 });

  return Response.json({
    account: `workspace_${apiKey.workspaceId}`,
    key_name: apiKey.name,
    unlimited: apiKey.budgetLimitQuota === null,
    balance: {
      amount: Number(quotaToUsd(wallet.balanceUnits - wallet.reservedUnits).toFixed(4)),
      currency: "USD",
    },
    reserved: { amount: Number(quotaToUsd(wallet.reservedUnits).toFixed(4)), currency: "USD" },
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
