import Link from "next/link";
import { redirect } from "next/navigation";

import { ChannelActions } from "@/components/dashboard/channel-actions";
import { ChannelManager } from "@/components/dashboard/channel-manager";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { getRegistry } from "@/lib/relay";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";
import { resolveLocale } from "@/lib/i18n/server";

export default async function ChannelsPage({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const p = await params;
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref(locale, "/login"));
  const id = Number(p.workspaceId);
  const workspace = await requireWorkspacePermission(user.id, id, "read");
  const channels = (await getRegistry()).listChannels().filter((channel) => channel.ownerType === "workspace" && channel.workspaceId === id);
  const t = getDictionary(locale).dashboard.workspace.channels;
  const canManage = workspace.role !== "member";

  return <div className="flex flex-col gap-6">
    <Link className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${id}`)}>← {workspace.name}</Link>
    <div><h1 className="text-[22px] font-semibold tracking-tight">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.description}</p></div>
    <ChannelManager workspaceId={id} canManage={canManage} allowPlatformChannels={workspace.allowPlatformChannels} locale={locale} />
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-medium">{t.myChannels}</h2><p className="mt-1 text-sm text-muted-foreground">{t.myChannelsDescription}</p></div>
      <div className="overflow-x-auto"><table className="table"><thead><tr><th>{t.name}</th><th>{t.upstream}</th><th>{t.models}</th><th>{t.status}</th><th /></tr></thead><tbody>
        {channels.map((channel) => <tr key={channel.id}><td className="font-medium">{channel.name}</td><td className="font-mono text-xs">{new URL(channel.baseUrl).host}</td><td>{channel.models.length}</td><td><span className={`badge badge-outline ${channel.status === 1 ? "badge-success" : channel.status === 2 ? "badge-warning" : ""}`}>{channel.status === 1 ? t.enabled : channel.status === 2 ? t.autoDisabled : t.disabled}</span></td><td>{canManage && <ChannelActions workspaceId={id} channelId={channel.id} status={channel.status} name={channel.name} locale={locale} />}</td></tr>)}
        {!channels.length && <tr><td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{t.empty}</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
