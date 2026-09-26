import { authenticateKey, getRegistry, quotaToCurrency, systemCurrency, workspaceCurrency } from "@/lib/relay";
import { getDatabase } from "@/lib/relay/store";

/** 当前密钥的额度余额（quota -> USD）。 */
export async function GET(request: Request) {
  const registry = await getRegistry();

  const auth = (await authenticateKey(registry, request, "billing.read"));
  if (!auth.ok) return auth.response;
  const { apiKey } = auth;

  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const records = (await registry
    .listUsage({ keyId: apiKey.id }))
    .filter((r) => r.createdAt >= since);
  const spend = records.reduce((sum, r) => sum + r.quota, 0);

  const wallet = (await registry.getWorkspaceWallet(apiKey.workspaceId));
  if (!wallet) return Response.json({ error: { code: "workspace_wallet_not_found", message: "Workspace wallet is unavailable." } }, { status: 503 });

  const currency = (await workspaceCurrency(await getDatabase(), apiKey.workspaceId, systemCurrency((await registry.getSettings()))));
  const money = (quota: number) => ({ amount: Number(quotaToCurrency(quota, currency).toFixed(4)), currency: currency.code });
  return Response.json({
    account: `workspace_${apiKey.workspaceId}`,
    key_name: apiKey.name,
    unlimited: apiKey.budgetLimitQuota === null,
    balance: money(wallet.balanceUnits - wallet.reservedUnits),
    reserved: money(wallet.reservedUnits),
    period: {
      starts_at: new Date(since).toISOString(),
      spend: money(spend),
      requests: records.length,
    },
  });
}
