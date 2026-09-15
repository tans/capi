import { redirect } from "next/navigation";
import { WorkspaceKeyActions } from "@/components/dashboard/workspace-key-actions";
import { WorkspaceKeyManager } from "@/components/dashboard/workspace-key-manager";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary, interpolate } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { getRegistry } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export default async function WorkspaceKeys({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const { workspaceId } = await params;
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref(locale, "/login"));
  const id = Number(workspaceId);
  if (!Number.isInteger(id)) redirect(localeHref(locale, "/dashboard"));
  const workspace = await requireWorkspacePermission(user.id, id, "read");
  const keys = (await getRegistry()).listKeys().filter((key) => key.workspaceId === id && (workspace.role !== "member" || key.userId === user.id));
  const t = getDictionary(locale).dashboard.workspace.keys;
  return <div className="flex flex-col gap-6">
    <div><a className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${id}`)}>← {workspace.name}</a><h1 className="mt-3 text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-base-content/60">{t.description}</p></div>
    <WorkspaceKeyManager workspaceId={id} canManage={workspace.role !== "member"} locale={locale} />
    <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100"><table className="table"><thead><tr><th>{t.name}</th><th>{t.key}</th><th>{t.permissions}</th><th>{t.budget}</th><th>{t.status}</th><th aria-label={t.actions} /></tr></thead><tbody>
      {keys.map((key) => { const active = key.status === 1; const spent = key.budgetLimitQuota === null ? 0 : Math.min(100, key.budgetSpentQuota / key.budgetLimitQuota * 100); return <tr key={key.id}><td className="font-medium">{key.name || interpolate(t.fallbackName, { id: key.id })}</td><td><code className="text-xs">{key.key}</code></td><td><div className="flex max-w-56 flex-wrap gap-1">{(key.scopes ?? []).map((scope) => <span className="badge badge-ghost badge-sm" key={scope}>{scope}</span>)}</div></td><td className="min-w-32">{key.budgetLimitQuota === null ? t.noLimit : <><div className="text-xs">${(key.budgetSpentQuota / 500000).toFixed(2)} / ${(key.budgetLimitQuota / 500000).toFixed(2)}</div><progress className="progress progress-primary w-24" value={spent} max="100" /></>}</td><td><span className={`badge badge-outline ${active ? "badge-success" : "badge-error"}`}>{active ? t.active : t.revoked}</span></td><td>{workspace.role !== "member" && <WorkspaceKeyActions workspaceId={id} keyId={key.id} status={key.status} locale={locale} />}</td></tr>; })}
      {keys.length === 0 && <tr><td className="py-8 text-center text-base-content/60" colSpan={6}>{t.empty}</td></tr>}
    </tbody></table></div>
  </div>;
}
