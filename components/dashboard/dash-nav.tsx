"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, LayoutDashboard, Radio, ScrollText, Settings, SlidersHorizontal, Users, WalletCards } from "lucide-react";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type NavigationItem = { href: string; label: string; icon: typeof LayoutDashboard };

export function DashNav({ locale, user, className }: { locale: Locale; user: { permissions: string[] }; className?: string }) {
  const pathname = usePathname();
  const dictionary = getDictionary(locale);
  const workspaceId = pathname.match(/\/dashboard\/w\/(\d+)/)?.[1];
  const zh = locale === "zh";
  const generalItems: NavigationItem[] = [
    { href: "/dashboard", label: dictionary.dashboard.nav.overview, icon: LayoutDashboard },
    { href: "/dashboard/settings", label: dictionary.dashboard.nav.settings, icon: Settings },
  ];
  const workspaceItems: NavigationItem[] = workspaceId ? [
    { href: `/dashboard/w/${workspaceId}`, label: zh ? "概览" : "Overview", icon: LayoutDashboard },
    { href: `/dashboard/w/${workspaceId}/logs`, label: zh ? "使用记录" : "Usage records", icon: ScrollText },
    { href: `/dashboard/w/${workspaceId}/usage`, label: zh ? "用量分析" : "Usage analytics", icon: SlidersHorizontal },
    { href: `/dashboard/w/${workspaceId}/keys`, label: zh ? "API 密钥" : "API keys", icon: KeyRound },
    { href: `/dashboard/w/${workspaceId}/members`, label: zh ? "成员" : "Members", icon: Users },
    { href: `/dashboard/w/${workspaceId}/billing`, label: zh ? "账单" : "Billing", icon: WalletCards },
    { href: `/dashboard/w/${workspaceId}/channels`, label: zh ? "渠道" : "Channels", icon: Radio },
    { href: `/dashboard/w/${workspaceId}/settings`, label: zh ? "工作区设置" : "Workspace settings", icon: Settings },
  ] : generalItems;
  const items = workspaceId ? workspaceItems : generalItems;
  const title = workspaceId ? (zh ? "工作区" : "Workspace") : (zh ? "控制台" : "Dashboard");
  const navLink = (item: NavigationItem) => {
    const href = localeHref(locale, item.href);
    const active = item.href === `/dashboard/w/${workspaceId}` || item.href === "/dashboard" || item.href === "/dashboard/admin" ? pathname === href : pathname.startsWith(href);
    return <Link key={item.href} href={href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors", active ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><item.icon className="size-4 shrink-0" />{item.label}</Link>;
  };

  return <nav aria-label={title} className={cn("flex flex-col gap-0.5", className)}>
    <p className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground">{title}</p>
    {items.map(navLink)}
    {user.permissions.includes("admin:access") && <Link href={localeHref(locale, "/dashboard/admin")} aria-label={zh ? "进入管理员" : "Open administrator"} className={cn("mt-4 flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors", pathname.startsWith(localeHref(locale, "/dashboard/admin")) ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Settings className="size-4 shrink-0" />{zh ? "管理员" : "Administrator"}</Link>}
  </nav>;
}
