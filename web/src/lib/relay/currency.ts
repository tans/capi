// Legacy components express quota in 500,000 units per USD. The Go API
// explicitly projects integer micros into those units at the console boundary.
export type Currency = { code: string; symbol: string };
export const USD: Currency = { code: "USD", symbol: "$" };
const QUOTA_PER_UNIT = 500_000;

export function quotaToCurrency(quota: number, currency: Currency): number {
  return quota / QUOTA_PER_UNIT;
}

export function currencyToQuota(amount: number, currency: Currency): number {
  return Math.round(amount * QUOTA_PER_UNIT);
}

export function formatCurrency(amount: number, currency: Currency, digits = 2): string {
  return `${currency.symbol}${amount.toFixed(digits)}`;
}

export function formatQuota(quota: number, currency: Currency, digits = 2): string {
  return formatCurrency(quotaToCurrency(quota, currency), currency, digits);
}
