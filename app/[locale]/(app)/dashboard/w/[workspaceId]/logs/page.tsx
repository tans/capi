import { redirect } from "next/navigation";

import { UsageLogTable } from "@/components/dashboard/usage-log-table";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary, interpolate } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { getRegistry } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export default async function WorkspaceUsageRecords({
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
  const t = getDictionary(locale).dashboard.workspace.logs;

  return <div className="flex flex-col gap-6"><div><h1 className="text-[22px] font-semibold tracking-tight">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{interpolate(t.description, { workspace: workspace.name })}</p></div><UsageLogTable records={records} locale={locale} /></div>;
}
