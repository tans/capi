import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Link from "next/link";
import { WorkspaceKeyManager } from "@/components/dashboard/workspace-key-manager";
import { WorkspaceKeyTable } from "@/components/dashboard/workspace-key-table";
import { RedeemCodeForm } from "@/components/dashboard/redeem-code-form";
import { ChannelManager } from "@/components/dashboard/channel-manager";
import type { ChannelDraft } from "@/lib/relay/channel-draft";
import { UsageLogTable } from "@/components/dashboard/usage-log-table";
import { BarChart } from "@/components/dashboard/charts";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import type { ApiKey, UsageRecord } from "@/lib/relay/types";
import type { Currency } from "@/lib/relay/currency";
import { api, useResource, type Workspace } from "./api";
import { Feedback } from "./app";

export type WorkspaceDetail = { workspace: Workspace & { allowPlatformChannels: boolean }; groups: { name: string; displayName: string }[]; currency: Currency; balance_micros: number; models: string[]; platformModels: string[] };
type Usage = { data: UsageRecord[]; total: number; page: number; pageSize: number; days: number; summary: { requests: number; tokens: number; cost_micros: number; failed: number }; models: { model: string; requests: number; tokens: number; cost_micros: number }[]; daily: { date: string; requests: number; cost_micros: number }[] };
const ledgerReason = (kind: string, reason: string, locale: Locale) => {
  if (locale !== "zh") return reason;
  if (kind === "charge" && reason === "Relay usage settlement") return "API 用量结算";
  return ({ "Opening balance": "期初余额", "Imported balance": "迁入余额", "Administrator credit": "管理员充值", "Redemption: Credit": "兑换码充值" } as Record<string, string>)[reason] || reason;
};
const money = (micros: number, currency: Currency, digits = 4) => `${currency.symbol}${(micros / 1_000_000 * currency.rate).toFixed(digits)}`;

function WorkspaceHeading({ detail, locale, title, description }: { detail: WorkspaceDetail; locale: Locale; title: string; description?: string }) {
  return <div><Link className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${detail.workspace.id}`)}>← {detail.workspace.name}</Link><div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div><div className="rounded-box border border-base-300 bg-base-100 px-4 py-2 text-sm"><span className="text-base-content/60">{getDictionary(locale).dashboard.workspace.keys.wallet}</span> <span className="font-medium">{money(detail.balance_micros, detail.currency, 2)}</span></div></div></div>;
}

export function KeysPage({ locale }: { locale: Locale }) {
  const { workspaceId } = useParams();
  const workspace = useResource<WorkspaceDetail>(`/api/workspaces/${workspaceId}`);
  const keys = useResource<{ data: ApiKey[] }>(`/api/workspaces/${workspaceId}/keys`);
  const t = getDictionary(locale).dashboard.workspace.keys;
  if (!workspace.data || !keys.data) return <Feedback loading={workspace.loading || keys.loading} error={workspace.error || keys.error} locale={locale} />;
  const detail = workspace.data; const canManage = ["owner", "admin"].includes(detail.workspace.role);
  return <div className="flex flex-col gap-6"><WorkspaceHeading detail={detail} locale={locale} title={t.title} description={t.description} /><WorkspaceKeyManager workspaceId={detail.workspace.id} groups={detail.groups} canManage={canManage} locale={locale} currency={detail.currency} /><WorkspaceKeyTable workspaceId={detail.workspace.id} keys={keys.data.data} groups={detail.groups} canManage={canManage} locale={locale} currency={detail.currency} /></div>;
}

export function UsagePage({ locale, view = "usage" }: { locale: Locale; view?: "overview" | "usage" | "logs" | "billing" }) {
  const { workspaceId } = useParams();
  const [query, setQuery] = useSearchParams();
  const workspace = useResource<WorkspaceDetail>(`/api/workspaces/${workspaceId}`);
  const usage = useResource<Usage>(`/api/workspaces/${workspaceId}/usage?${query}`);
  const [modelFilter, setModelFilter] = useState(query.get("model") || "");
  const t = getDictionary(locale).dashboard.workspace;
  if (!workspace.data || !usage.data) return <Feedback loading={workspace.loading || usage.loading} error={workspace.error || usage.error} locale={locale} />;
  const detail = workspace.data; const data = usage.data;
  const title = view === "overview" ? detail.workspace.name : view === "billing" ? t.billing.title : view === "logs" ? getDictionary(locale).dashboard.nav.logs : t.usage.title;
  const change = (key: string, value: string) => { const next = new URLSearchParams(query); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.delete("page"); setQuery(next); };
  return <div className="flex flex-col gap-6"><WorkspaceHeading detail={detail} locale={locale} title={title} />
    <div className="flex flex-wrap items-center gap-2">{[7, 30, 90].map(days => <button key={days} className={`btn btn-xs ${data.days === days ? "btn-active" : "btn-outline"}`} onClick={() => change("days", String(days))}>{days} {t.usage.days}</button>)}{view === "overview" && <Link className="btn btn-xs" href={localeHref(locale, `/dashboard/w/${workspaceId}/keys`)}>{t.overview.apiKeys}</Link>}</div>
    <div className="stats stats-vertical border border-border bg-card shadow-none sm:stats-horizontal"><div className="stat"><div className="stat-title">{t.overview.requests}</div><div className="stat-value text-2xl">{data.summary.requests.toLocaleString()}</div></div><div className="stat"><div className="stat-title">{t.overview.tokens}</div><div className="stat-value text-2xl">{data.summary.tokens.toLocaleString()}</div></div><div className="stat"><div className="stat-title">{t.overview.charge}</div><div className="stat-value text-2xl">{money(data.summary.cost_micros, detail.currency)}</div></div></div>
    {view !== "logs" && <section className="overflow-hidden rounded-md border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="text-[15px] font-semibold">{t.overview.modelUsage}</h2></div><div className="overflow-x-auto"><table className="table table-sm"><thead><tr><th>{t.usage.model}</th><th>{t.usage.requests}</th><th>{t.usage.tokens}</th><th>{t.overview.charge}</th></tr></thead><tbody>{data.models.map(row => <tr key={row.model}><td className="font-mono text-xs">{row.model}</td><td>{row.requests}</td><td>{row.tokens.toLocaleString()}</td><td>{money(row.cost_micros, detail.currency)}</td></tr>)}{!data.models.length && <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">{t.usage.empty}</td></tr>}</tbody></table></div></section>}
    {view === "usage" && data.daily.length > 0 && <section className="rounded-md border border-border bg-card p-5"><h2 className="mb-5 font-medium">{locale === "zh" ? "每日请求量（UTC）" : "Daily requests (UTC)"}</h2><BarChart data={data.daily.map(row => row.requests)} labels={data.daily.map(row => row.date.slice(5))} /></section>}
    {view === "logs" && <><form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); change("model", modelFilter); }}><label className="fieldset"><span className="fieldset-legend">{t.usage.model}</span><input className="input input-sm" value={modelFilter} onChange={event => setModelFilter(event.target.value)} /></label><label className="fieldset"><span className="fieldset-legend">{locale === "zh" ? "状态" : "Status"}</span><select className="select select-sm" value={query.get("status") || ""} onChange={event => change("status", event.target.value)}><option value="">{locale === "zh" ? "全部" : "All"}</option><option value="success">{locale === "zh" ? "成功" : "Success"}</option><option value="error">{locale === "zh" ? "失败" : "Failed"}</option></select></label><button className="btn btn-sm">{locale === "zh" ? "筛选" : "Filter"}</button></form><UsageLogTable records={data.data} locale={locale} currency={detail.currency} /><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{data.total} {locale === "zh" ? "条记录" : "records"}</span><div className="join"><button className="btn btn-sm join-item" disabled={data.page <= 1} onClick={() => change("page", String(data.page - 1))}>{locale === "zh" ? "上一页" : "Previous"}</button><span className="btn btn-sm join-item pointer-events-none">{data.page}</span><button className="btn btn-sm join-item" disabled={data.page * data.pageSize >= data.total} onClick={() => change("page", String(data.page + 1))}>{locale === "zh" ? "下一页" : "Next"}</button></div></div></>}
  </div>;
}

export function NewWorkspacePage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).dashboard.workspace.create;
  const navigate = useNavigate();
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <div className="mx-auto max-w-xl"><Link className="link link-hover text-sm" href={localeHref(locale, "/dashboard")}>← {t.back}</Link><div className="card mt-5 border border-border bg-card"><div className="card-body"><h1 className="card-title text-xl">{t.title}</h1><p className="text-sm text-muted-foreground">{t.description}</p><form className="mt-5 flex flex-col gap-4" onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); try { const workspace = await api<Workspace>("/api/workspaces", { method: "POST", body: JSON.stringify({ name }) }); window.dispatchEvent(new Event("capi:refresh")); navigate(localeHref(locale, `/dashboard/w/${workspace.id}`)); } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); } finally { setBusy(false); } }}><label className="fieldset"><span className="fieldset-legend">{t.name}</span><input className="input w-full" value={name} onChange={event => setName(event.target.value)} placeholder={t.placeholder} maxLength={100} required /></label>{error && <div className="alert alert-error" role="alert">{error}</div>}<button className="btn btn-primary self-start" disabled={busy}>{busy ? t.saving : t.submit}</button></form></div></div></div>;
}

export function ChannelsPage({ locale }: { locale: Locale }) {
  const { workspaceId } = useParams();
  const workspace = useResource<WorkspaceDetail>(`/api/workspaces/${workspaceId}`);
  const channels = useResource<{ data: ChannelDraft[] }>(`/api/workspaces/${workspaceId}/channels`);
  const t = getDictionary(locale).dashboard.workspace.channels;
  if (!workspace.data || !channels.data) return <Feedback loading={workspace.loading || channels.loading} error={workspace.error || channels.error} locale={locale} />;
  const detail = workspace.data;
  return <div className="flex flex-col gap-6"><WorkspaceHeading detail={detail} locale={locale} title={t.title} description={t.description} /><ChannelManager workspaceId={detail.workspace.id} canManage={["owner", "admin"].includes(detail.workspace.role)} allowPlatformChannels={detail.workspace.allowPlatformChannels} locale={locale} channels={channels.data.data} platformModels={detail.platformModels} /></div>;
}


type Billing = { unresolved_requests: number; balance_micros: number; reserved_micros: number; available_micros: number; data: { id: string; kind: string; delta_micros: number; reason: string; created_at: string }[]; total: number; page: number; pageSize: number };
export function BillingPage({ locale }: { locale: Locale }) {
  const { workspaceId } = useParams();
  const [query, setQuery] = useSearchParams();
  const workspace = useResource<WorkspaceDetail>(`/api/workspaces/${workspaceId}`);
  const billing = useResource<Billing>(`/api/workspaces/${workspaceId}/billing?${query}`);
  const t = getDictionary(locale).dashboard.workspace.billing;
  if (!workspace.data || !billing.data) return <Feedback loading={workspace.loading || billing.loading} error={workspace.error || billing.error} locale={locale} />;
  const detail = workspace.data; const data = billing.data;
  const page = (value: number) => { const next = new URLSearchParams(query); next.set("page", String(value)); setQuery(next); };
  return <div className="flex flex-col gap-6">
    <div><Link className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${workspaceId}`)}>← {detail.workspace.name}</Link><h1 className="mt-3 text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.creditAddedTo} <strong>{detail.workspace.name}</strong></p></div>
    <div className="grid gap-4 sm:grid-cols-3">{[[t.available, data.available_micros], [t.balance, data.balance_micros], [t.reserved, data.reserved_micros]].map(([label, value]) => <div className="stat rounded-box border border-border bg-card" key={label}><div className="stat-title">{label}</div><div className="stat-value text-2xl">{money(Number(value), detail.currency, 2)}</div><div className="stat-desc">{detail.currency.code}</div></div>)}</div>
    {data.unresolved_requests > 0 && <div className="alert alert-warning" role="alert">{locale === "zh" ? `${data.unresolved_requests} 笔请求在服务中断后未确认结算。预留已释放，请联系管理员核对上游用量。` : `${data.unresolved_requests} interrupted requests have unconfirmed billing. Reservations were released; contact an administrator to reconcile upstream usage.`}</div>}
    {["owner", "admin"].includes(detail.workspace.role) && <RedeemCodeForm workspaceId={detail.workspace.id} workspaceName={detail.workspace.name} locale={locale} currency={detail.currency} />}
    <section className="overflow-hidden rounded-box border border-border bg-card"><h2 className="border-b border-border p-4 font-medium">{t.recentActivity}</h2><div className="overflow-x-auto"><table className="table table-sm"><thead><tr><th>{t.date}</th><th>{t.description}</th><th className="text-right">{t.amount}</th></tr></thead><tbody>{data.data.map(entry => <tr key={entry.id}><td className="whitespace-nowrap text-muted-foreground">{new Date(entry.created_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</td><td>{ledgerReason(entry.kind, entry.reason, locale)}</td><td className={`text-right tabular-nums ${entry.delta_micros >= 0 ? "text-success" : ""}`}>{entry.delta_micros >= 0 ? "+" : ""}{money(entry.delta_micros, detail.currency)}</td></tr>)}{!data.data.length && <tr><td colSpan={3} className="py-10 text-center text-muted-foreground">{locale === "zh" ? "暂无账单记录" : "No billing activity yet"}</td></tr>}</tbody></table></div></section>
    {data.total > data.pageSize && <div className="flex justify-end"><div className="join"><button className="btn btn-sm join-item" disabled={data.page <= 1} onClick={() => page(data.page - 1)}>{locale === "zh" ? "上一页" : "Previous"}</button><span className="btn btn-sm join-item pointer-events-none">{data.page}</span><button className="btn btn-sm join-item" disabled={data.page * data.pageSize >= data.total} onClick={() => page(data.page + 1)}>{locale === "zh" ? "下一页" : "Next"}</button></div></div>}
  </div>;
}
