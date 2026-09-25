import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";
import { getDatabase } from "@/lib/relay/store";
import { formatQuota, getRegistry, systemCurrency, workspaceCurrency } from "@/lib/relay";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { RedeemCodeForm } from "@/components/dashboard/redeem-code-form";

export default async function WorkspaceBilling({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const p = await params;
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref(locale, "/login"));
  const id = Number(p.workspaceId);
  if (!Number.isInteger(id) || id <= 0) redirect(localeHref(locale, "/dashboard"));
  const workspace = await requireWorkspacePermission(user.id, id, "read");
  const db = await getDatabase();
  const entries = db.query<{ kind: string; delta_units: number; reason: string; created_at: number }, [number]>("SELECT kind, delta_units, reason, created_at FROM wallet_entries WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 20").all(id);
  const rows = db.query<{ balance_units: number; reserved_units: number }, [number]>("SELECT balance_units, reserved_units FROM wallets WHERE workspace_id = ?").get(id) ?? { balance_units: 0, reserved_units: 0 };
  const currency = workspaceCurrency(db, id, systemCurrency((await getRegistry()).settings));
  const t = getDictionary(locale).dashboard.workspace.billing;
  return <div className="flex flex-col gap-6">
    <div><a className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${id}`)}>← {workspace.name}</a><h1 className="mt-3 text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.creditAddedTo} <strong>{workspace.name}</strong></p></div>
    <div className="grid gap-4 sm:grid-cols-3">{[[t.available, rows.balance_units - rows.reserved_units], [t.balance, rows.balance_units], [t.reserved, rows.reserved_units]].map(([label, value]) => <div className="stat rounded-box border border-border bg-card" key={label as string}><div className="stat-title">{label}</div><div className="stat-value text-2xl">{formatQuota(Number(value), currency)}</div><div className="stat-desc">{currency.code}</div></div>)}</div>
    <RedeemCodeForm workspaceId={id} workspaceName={workspace.name} locale={locale} currency={currency} />
    <div className="rounded-box border border-border bg-card"><div className="border-b border-border p-4 font-medium">{t.recentActivity}</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">{t.date}</th><th className="p-3">{t.description}</th><th className="p-3 text-right">{t.amount}</th></tr></thead><tbody>{entries.map((entry, index) => <tr className="border-b last:border-0" key={`${entry.created_at}-${index}`}><td className="p-3 text-muted-foreground">{new Date(entry.created_at).toLocaleString(locale)}</td><td className="p-3">{entry.reason}</td><td className={`p-3 text-right font-medium ${entry.delta_units >= 0 ? "text-success" : ""}`}>{entry.delta_units >= 0 ? "+" : ""}{formatQuota(entry.delta_units, currency)}</td></tr>)}</tbody></table></div></div>
  </div>;
}
