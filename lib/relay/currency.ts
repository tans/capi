import type { AsyncSqliteQueryAdapter } from "../storage";
import { QUOTA_PER_UNIT, type RelaySettings } from "./config";

/** The ledger and model price table are USD-denominated. Rates mean units of display currency per USD. */
export type Currency = { code: string; symbol: string; rate: number };
export const USD: Currency = { code: "USD", symbol: "$", rate: 1 };

export function validCurrency(value: unknown): value is Currency {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { code, symbol, rate } = value as Record<string, unknown>;
  return typeof code === "string" && /^[A-Za-z]{3}$/.test(code) &&
    typeof symbol === "string" && symbol.trim() === symbol && symbol.length > 0 && [...symbol].length <= 8 &&
    typeof rate === "number" && Number.isFinite(rate) && rate > 0 && rate <= 1_000_000;
}

export function systemCurrency(settings: RelaySettings): Currency {
  return validCurrency(settings.pricingCurrency) ? settings.pricingCurrency : USD;
}

/** A NULL workspace override follows the system setting, including later system edits. */
export async function workspaceCurrency(db: AsyncSqliteQueryAdapter, workspaceId: number, system: Currency): Promise<Currency> {
  const row = (await db.query<{ display_currency: string | null; display_symbol: string | null; display_rate: number | null }, [number]>(
    "SELECT display_currency, display_symbol, display_rate FROM workspaces WHERE id = ?",
  ).get(workspaceId));
  const override = row?.display_currency && row.display_symbol && row.display_rate !== null
    ? { code: row.display_currency, symbol: row.display_symbol, rate: row.display_rate } : null;
  return validCurrency(override) ? override : system;
}

export function quotaToCurrency(quota: number, currency: Currency): number {
  return quota / QUOTA_PER_UNIT * currency.rate;
}

export function currencyToQuota(amount: number, currency: Currency): number {
  return Math.round(amount / currency.rate * QUOTA_PER_UNIT);
}

export function formatCurrency(amount: number, currency: Currency, digits = 2): string {
  return `${currency.symbol}${amount.toFixed(digits)}`;
}

export function formatQuota(quota: number, currency: Currency, digits = 2): string {
  return formatCurrency(quotaToCurrency(quota, currency), currency, digits);
}
