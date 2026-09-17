import Link from "next/link";
import { redirect } from "next/navigation";

import { ChannelManager } from "@/components/dashboard/channel-manager";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { getRegistry } from "@/lib/relay";
import { toChannelDraft } from "@/lib/relay/channel-draft";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";
import { resolveLocale } from "@/lib/i18n/server";

export default async function ChannelsPage({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const p = await params;
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref(locale, "/login"));
  const id = Number(p.workspaceId);
  const workspace = await requireWorkspacePermission(user.id, id, "read");
  const channels = (await getRegistry())
    .listChannels()
    .filter((channel) => channel.ownerType === "workspace" && channel.workspaceId === id)
    .map(toChannelDraft);
  const t = getDictionary(locale).dashboard.workspace.channels;
  const canManage = workspace.role !== "member";

  return <div className="flex flex-col gap-6">
    <Link className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${id}`)}>← {workspace.name}</Link>
    <div><h1 className="text-[22px] font-semibold tracking-tight">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.description}</p></div>
    <ChannelManager workspaceId={id} canManage={canManage} allowPlatformChannels={workspace.allowPlatformChannels} locale={locale} channels={channels} />
  </div>;
}
