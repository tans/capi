import { redirect } from "next/navigation";
import { WorkspaceKeyActions } from "@/components/dashboard/workspace-key-actions";
import { WorkspaceKeyManager } from "@/components/dashboard/workspace-key-manager";
import { getCurrentUser } from "@/lib/auth";
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
  const zh = locale === "zh";
  return <div className="flex flex-col gap-6">
    <div><a className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${id}`)}>← {workspace.name}</a><h1 className="mt-3 text-2xl font-semibold">{zh ? "API 密钥" : "API keys"}</h1><p className="mt-1 text-sm text-base-content/60">{zh ? "密钥是调用凭证；额度上限独立于空间钱包余额。" : "Keys authorize API calls; their caps are separate from workspace wallet funds."}</p></div>
    <WorkspaceKeyManager workspaceId={id} canManage={workspace.role !== "member"} />
    <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100"><table className="table"><thead><tr><th>{zh ? "名称" : "Name"}</th><th>{zh ? "密钥" : "Key"}</th><th>{zh ? "权限" : "Permissions"}</th><th>{zh ? "额度" : "Budget"}</th><th>{zh ? "状态" : "Status"}</th><th aria-label={zh ? "操作" : "Actions"} /></tr></thead><tbody>
      {keys.map((key) => { const active = key.status === 1; const spent = key.budgetLimitQuota === null ? 0 : Math.min(100, key.budgetSpentQuota / key.budgetLimitQuota * 100); return <tr key={key.id}><td className="font-medium">{key.name || `Key ${key.id}`}</td><td><code className="text-xs">{key.key}</code></td><td><div className="flex max-w-56 flex-wrap gap-1">{(key.scopes ?? []).map((scope) => <span className="badge badge-ghost badge-sm" key={scope}>{scope}</span>)}</div></td><td className="min-w-32">{key.budgetLimitQuota === null ? (zh ? "不限额" : "No limit") : <><div className="text-xs">${(key.budgetSpentQuota / 500000).toFixed(2)} / ${(key.budgetLimitQuota / 500000).toFixed(2)}</div><progress className="progress progress-primary w-24" value={spent} max="100" /></>}</td><td><span className={`badge badge-outline ${active ? "badge-success" : "badge-error"}`}>{active ? (zh ? "启用" : "Active") : (zh ? "已撤销" : "Revoked")}</span></td><td>{workspace.role !== "member" && <WorkspaceKeyActions workspaceId={id} keyId={key.id} status={key.status} />}</td></tr>; })}
      {keys.length === 0 && <tr><td className="py-8 text-center text-base-content/60" colSpan={6}>{zh ? "还没有密钥。创建一个开始调用接口。" : "No keys yet. Create one to start calling the API."}</td></tr>}
    </tbody></table></div>
  </div>;
}
