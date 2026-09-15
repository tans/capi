import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { getRegistry, quotaToUsd } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

type ModelUsage = {
  model: string;
  requests: number;
  tokens: number;
  quota: number;
};

export default async function WorkspaceOverview({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref(locale, "/login"));

  const id = Number(workspaceId);
  if (!Number.isInteger(id)) redirect(localeHref(locale, "/dashboard"));

  const workspace = await requireWorkspacePermission(user.id, id, "read");
  const registry = await getRegistry();
  const keys = registry.listKeys().filter((key) => key.workspaceId === id && (workspace.role !== "member" || key.userId === user.id));
  const keyIds = new Set(keys.map((key) => key.id));
  const records = registry.listUsage({ days: 30 }).filter((record) => keyIds.has(record.keyId));
  const byModel = new Map<string, ModelUsage>();

  for (const record of records) {
    const current = byModel.get(record.model) ?? { model: record.model, requests: 0, tokens: 0, quota: 0 };
    current.requests += 1;
    current.tokens += record.promptTokens + record.completionTokens;
    current.quota += record.quota;
    byModel.set(record.model, current);
  }

  const models = [...byModel.values()].sort((a, b) => b.quota - a.quota).slice(0, 5);
  const totalTokens = records.reduce((sum, record) => sum + record.promptTokens + record.completionTokens, 0);
  const totalCost = records.reduce((sum, record) => sum + record.quota, 0);
  const t = getDictionary(locale).dashboard.workspace.overview;
  const href = (path: string) => localeHref(locale, `/dashboard/w/${id}${path}`);

  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{workspace.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>
      <div className="join">
        <Link className="btn btn-sm join-item" href={href("/usage")}>{t.usageDetails}</Link>
        <Link className="btn btn-sm btn-outline join-item" href={href("/keys")}>{t.apiKeys}</Link>
      </div>
    </div>

    <div className="stats stats-vertical border border-border bg-card shadow-none sm:stats-horizontal">
      <div className="stat"><div className="stat-title">{t.requests}</div><div className="stat-value text-2xl">{records.length.toLocaleString()}</div></div>
      <div className="stat"><div className="stat-title">{t.tokens}</div><div className="stat-value text-2xl">{totalTokens.toLocaleString()}</div></div>
      <div className="stat"><div className="stat-title">{t.charge}</div><div className="stat-value text-2xl">${quotaToUsd(totalCost).toFixed(4)}</div></div>
    </div>

    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div><h2 className="text-[15px] font-semibold">{t.modelUsage}</h2><p className="mt-1 text-xs text-muted-foreground">{t.modelUsageDescription}</p></div>
        <Link className="link link-hover text-sm" href={href("/usage")}>{t.viewDetails}</Link>
      </div>
      <div className="overflow-x-auto"><table className="table table-sm"><thead><tr><th>{t.model}</th><th>{t.requests}</th><th>{t.tokens}</th><th>{t.charge}</th></tr></thead><tbody>{models.map((model) => <tr key={model.model}><td className="font-mono text-xs">{model.model}</td><td>{model.requests.toLocaleString()}</td><td>{model.tokens.toLocaleString()}</td><td>${quotaToUsd(model.quota).toFixed(4)}</td></tr>)}{models.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">{t.empty}</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
