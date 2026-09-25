import { redirect } from "next/navigation";
import { WorkspaceKeyManager, type KeyGroupOption } from "@/components/dashboard/workspace-key-manager";
import { WorkspaceKeyTable } from "@/components/dashboard/workspace-key-table";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { formatQuota, getRegistry, systemCurrency, workspaceCurrency } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export default async function WorkspaceKeys({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const { workspaceId } = await params;
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref(locale, "/login"));
  const id = Number(workspaceId);
  if (!Number.isInteger(id)) redirect(localeHref(locale, "/dashboard"));
  const workspace = await requireWorkspacePermission(user.id, id, "read");
  const registry = await getRegistry();
  const currency = workspaceCurrency(registry.database, id, systemCurrency(registry.settings));
  const canManage = workspace.role !== "member";
  const keys = registry.listKeys().filter((key) => key.workspaceId === id && (canManage || key.userId === user.id));
  const groups: KeyGroupOption[] = registry.listGroups().filter((group) => group.status === 1).map((group) => ({ name: group.name, displayName: group.displayName }));
  const wallet = registry.getWorkspaceWallet(id);
  const t = getDictionary(locale).dashboard.workspace.keys;

  return <div className="flex flex-col gap-6">
    <div>
      <a className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${id}`)}>← {workspace.name}</a>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-base-content/60">{t.description}</p></div>
        {wallet && <div className="rounded-box border border-base-300 bg-base-100 px-4 py-2 text-sm"><span className="text-base-content/60">{t.wallet}</span> <span className="font-medium">{formatQuota(wallet.balanceUnits, currency)}</span></div>}
      </div>
    </div>
    <WorkspaceKeyManager workspaceId={id} groups={groups} canManage={canManage} locale={locale} currency={currency} />
    <WorkspaceKeyTable workspaceId={id} keys={keys} groups={groups} canManage={canManage} locale={locale} currency={currency} />
  </div>;
}
