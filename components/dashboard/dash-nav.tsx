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
  const nav = getDictionary(locale).dashboard.components.nav;
  const workspaceId = pathname.match(/\/dashboard\/w\/(\d+)/)?.[1];
  const generalItems: NavigationItem[] = [
    { href: "/dashboard", label: getDictionary(locale).dashboard.nav.overview, icon: LayoutDashboard },
    { href: "/dashboard/settings", label: getDictionary(locale).dashboard.nav.settings, icon: Settings },
  ];
  const items: NavigationItem[] = workspaceId ? [
    { href: `/dashboard/w/${workspaceId}`, label: getDictionary(locale).dashboard.nav.overview, icon: LayoutDashboard },
    { href: `/dashboard/w/${workspaceId}/logs`, label: getDictionary(locale).dashboard.nav.logs, icon: ScrollText },
    { href: `/dashboard/w/${workspaceId}/usage`, label: nav.usageAnalytics, icon: SlidersHorizontal },
    { href: `/dashboard/w/${workspaceId}/keys`, label: getDictionary(locale).dashboard.nav.keys, icon: KeyRound },
    { href: `/dashboard/w/${workspaceId}/members`, label: nav.members, icon: Users },
    { href: `/dashboard/w/${workspaceId}/billing`, label: nav.billing, icon: WalletCards },
    { href: `/dashboard/w/${workspaceId}/channels`, label: nav.channels, icon: Radio },
    { href: `/dashboard/w/${workspaceId}/settings`, label: nav.workspaceSettings, icon: Settings },
  ] : generalItems;
  const title = workspaceId ? nav.workspace : nav.dashboard;
  const navLink = (item: NavigationItem) => {
    const href = localeHref(locale, item.href);
    const active = item.href === `/dashboard/w/${workspaceId}` || item.href === "/dashboard" || item.href === "/dashboard/admin" ? pathname === href : pathname.startsWith(href);
    return <Link key={item.href} href={href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors", active ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><item.icon className="size-4 shrink-0" />{item.label}</Link>;
  };

  return <nav aria-label={title} className={cn("flex flex-col gap-0.5", className)}>
    <p className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground">{title}</p>
    {items.map(navLink)}
    {user.permissions.includes("admin:access") && <Link href={localeHref(locale, "/dashboard/admin")} aria-label={nav.openAdministrator} className={cn("mt-4 flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors", pathname.startsWith(localeHref(locale, "/dashboard/admin")) ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Settings className="size-4 shrink-0" />{nav.administrator}</Link>}
  </nav>;
}
