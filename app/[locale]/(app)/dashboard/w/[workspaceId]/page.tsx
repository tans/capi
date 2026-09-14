import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
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
  const zh = locale === "zh";
  const href = (path: string) => localeHref(locale, `/dashboard/w/${id}${path}`);

  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{workspace.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{zh ? "最近 30 天的工作区用量概览。" : "Workspace usage overview for the last 30 days."}</p>
      </div>
      <div className="join">
        <Link className="btn btn-sm join-item" href={href("/usage")}>{zh ? "用量明细" : "Usage details"}</Link>
        <Link className="btn btn-sm btn-outline join-item" href={href("/keys")}>{zh ? "API 密钥" : "API keys"}</Link>
      </div>
    </div>

    <div className="stats stats-vertical border border-border bg-card shadow-none sm:stats-horizontal">
      <div className="stat"><div className="stat-title">{zh ? "请求数" : "Requests"}</div><div className="stat-value text-2xl">{records.length.toLocaleString()}</div></div>
      <div className="stat"><div className="stat-title">{zh ? "Token" : "Tokens"}</div><div className="stat-value text-2xl">{totalTokens.toLocaleString()}</div></div>
      <div className="stat"><div className="stat-title">{zh ? "实际扣费" : "Charge"}</div><div className="stat-value text-2xl">${quotaToUsd(totalCost).toFixed(4)}</div></div>
    </div>

    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div><h2 className="text-[15px] font-semibold">{zh ? "模型用量" : "Model usage"}</h2><p className="mt-1 text-xs text-muted-foreground">{zh ? "按模型汇总请求、Token 与扣费。" : "Requests, tokens, and charges grouped by model."}</p></div>
        <Link className="link link-hover text-sm" href={href("/usage")}>{zh ? "查看明细" : "View details"}</Link>
      </div>
      <div className="overflow-x-auto"><table className="table table-sm"><thead><tr><th>{zh ? "模型" : "Model"}</th><th>{zh ? "请求数" : "Requests"}</th><th>{zh ? "Token" : "Tokens"}</th><th>{zh ? "扣费" : "Charge"}</th></tr></thead><tbody>{models.map((model) => <tr key={model.model}><td className="font-mono text-xs">{model.model}</td><td>{model.requests.toLocaleString()}</td><td>{model.tokens.toLocaleString()}</td><td>${quotaToUsd(model.quota).toFixed(4)}</td></tr>)}{models.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">{zh ? "暂无使用记录。创建 API 密钥并发起调用后，这里会显示数据。" : "No usage records yet. Create an API key and make a request to see data here."}</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
