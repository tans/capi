import { redirect } from "next/navigation";

import { UsageLogTable } from "@/components/dashboard/usage-log-table";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary, interpolate } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { getRegistry, systemCurrency, workspaceCurrency } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export default async function WorkspaceUsageRecords({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
  searchParams?: Promise<{ keyId?: string }>;
}) {
  const { workspaceId } = await params;
  const query = searchParams ? await searchParams : {};
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref(locale, "/login"));

  const id = Number(workspaceId);
  if (!Number.isInteger(id)) redirect(localeHref(locale, "/dashboard"));

  const workspace = await requireWorkspacePermission(user.id, id, "read");
  const registry = await getRegistry();
  const currency = (await workspaceCurrency(registry.database, id, systemCurrency((await registry.getSettings()))));
  const visible = (await registry.listKeys()).filter(
    (key) => key.workspaceId === id && (workspace.role !== "member" || key.userId === user.id),
  );
  const requestedKeyId = Number(query.keyId);
  const selected = Number.isInteger(requestedKeyId) ? visible.find((key) => key.id === requestedKeyId) : undefined;
  const keyIds = new Set((selected ? [selected] : visible).map((key) => key.id));
  const records = (await registry.listUsage({ days: 30 })).filter((record) => keyIds.has(record.keyId));
  const t = getDictionary(locale).dashboard.workspace.logs;

  return <div className="flex flex-col gap-6">
    <div>
      <h1 className="text-[22px] font-semibold tracking-tight">{t.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{interpolate(t.description, { workspace: workspace.name })}</p>
      {selected && <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="badge badge-ghost badge-sm">{interpolate(t.filteredBy, { name: selected.name || selected.key })}</span>
        <a className="link link-hover" href={localeHref(locale, `/dashboard/w/${id}/logs`)}>{t.clearFilter}</a>
      </p>}
    </div>
    <UsageLogTable records={records} locale={locale} currency={currency} />
  </div>;
}
