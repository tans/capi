import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getDictionary, interpolate } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { formatQuota, getRegistry, systemCurrency, workspaceCurrency } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export default async function WorkspaceUsage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
  searchParams?: Promise<{ days?: string }>;
}) {
  const p = await params;
  const query = searchParams ? await searchParams : {};
  const days = Math.min(Math.max(Number(query.days || 30), 1), 365);
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref(locale, "/login"));

  const id = Number(p.workspaceId);
  const workspace = await requireWorkspacePermission(user.id, id, "read");
  const registry = await getRegistry();
  const currency = (await workspaceCurrency(registry.database, id, systemCurrency((await registry.getSettings()))));
  const keys = (await registry.listKeys()).filter(
    (key) => key.workspaceId === id && (workspace.role !== "member" || key.userId === user.id),
  );
  const ids = new Set(keys.map((key) => key.id));
  const records = (await registry.listUsage({ days })).filter((record) => ids.has(record.keyId));
  const byModel = [...new Set(records.map((record) => record.model))].map((model) => ({
    model,
    requests: records.filter((record) => record.model === model).length,
    tokens: records.filter((record) => record.model === model).reduce((sum, record) => sum + record.promptTokens + record.completionTokens, 0),
  }));
  const t = getDictionary(locale).dashboard.workspace.usage;

  return <div className="flex flex-col gap-6"><a className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${id}`)}>← {workspace.name}</a><div><h1 className="text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{interpolate(workspace.role === "member" ? t.subtitleMember : t.subtitleWorkspace, { days })}</p></div><div className="flex gap-2"><a className="btn btn-xs btn-outline" href={localeHref(locale, `/dashboard/w/${id}/usage?days=7`)}>7 {t.days}</a><a className="btn btn-xs btn-outline" href={localeHref(locale, `/dashboard/w/${id}/usage?days=30`)}>30 {t.days}</a><a className="btn btn-xs btn-outline" href={localeHref(locale, `/dashboard/w/${id}/usage?days=90`)}>90 {t.days}</a></div><div className="grid gap-4 sm:grid-cols-2"><div className="stat rounded-box border border-border bg-card"><div className="stat-title">{t.requests}</div><div className="stat-value text-2xl">{records.length}</div></div><div className="stat rounded-box border border-border bg-card"><div className="stat-title">{t.tokens}</div><div className="stat-value text-2xl">{records.reduce((sum, record) => sum + record.promptTokens + record.completionTokens, 0).toLocaleString()}</div></div><div className="stat rounded-box border border-border bg-card"><div className="stat-title">{getDictionary(locale).dashboard.workspace.overview.charge}</div><div className="stat-value text-2xl">{formatQuota(records.reduce((sum, record) => sum + record.quota, 0), currency, 4)}</div></div></div><div className="overflow-x-auto rounded-box border border-border bg-card"><table className="table"><thead><tr><th>{t.model}</th><th>{t.requests}</th><th>{t.tokens}</th><th>{getDictionary(locale).dashboard.workspace.overview.charge}</th></tr></thead><tbody>{byModel.map((record) => <tr key={record.model}><td>{record.model}</td><td>{record.requests}</td><td>{record.tokens.toLocaleString()}</td><td>{formatQuota(records.filter((item) => item.model === record.model).reduce((sum, item) => sum + item.quota, 0), currency, 4)}</td></tr>)}{byModel.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">{t.empty}</td></tr>}</tbody></table></div></div>;
}
