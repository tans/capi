import Link from "next/link";
import { redirect } from "next/navigation";

import { ChannelActions } from "@/components/dashboard/channel-actions";
import { ChannelManager } from "@/components/dashboard/channel-manager";
import { getCurrentUser } from "@/lib/auth";
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
  const zh = locale === "zh";
  const canManage = workspace.role !== "member";

  return <div className="flex flex-col gap-6">
    <Link className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${id}`)}>← {workspace.name}</Link>
    <div><h1 className="text-[22px] font-semibold tracking-tight">{zh ? "渠道设置" : "Channel settings"}</h1><p className="mt-1 text-sm text-muted-foreground">{zh ? "选择 CAPI 默认渠道，或添加你自己购买的官方渠道。" : "Choose the CAPI default channel or add official channels you purchased."}</p></div>
    <ChannelManager workspaceId={id} canManage={canManage} allowPlatformChannels={workspace.allowPlatformChannels} />
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-medium">{zh ? "我的渠道" : "My channels"}</h2><p className="mt-1 text-sm text-muted-foreground">{zh ? "仅当前工作区自己添加的渠道会显示在这里。" : "Only channels added to this workspace appear here."}</p></div>
      <div className="overflow-x-auto"><table className="table"><thead><tr><th>{zh ? "名称" : "Name"}</th><th>{zh ? "上游地址" : "Upstream"}</th><th>{zh ? "模型" : "Models"}</th><th>{zh ? "状态" : "Status"}</th><th /></tr></thead><tbody>
        {channels.map((channel) => <tr key={channel.id}><td className="font-medium">{channel.name}</td><td className="font-mono text-xs">{new URL(channel.baseUrl).host}</td><td>{channel.models.length}</td><td><span className={`badge badge-outline ${channel.status === 1 ? "badge-success" : channel.status === 2 ? "badge-warning" : ""}`}>{channel.status === 1 ? (zh ? "已启用" : "Enabled") : channel.status === 2 ? (zh ? "自动禁用" : "Auto-disabled") : (zh ? "已禁用" : "Disabled")}</span></td><td>{canManage && <ChannelActions workspaceId={id} channelId={channel.id} status={channel.status} name={channel.name} />}</td></tr>)}
        {!channels.length && <tr><td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{zh ? "还没有添加自己的渠道。" : "You have not added a channel yet."}</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
