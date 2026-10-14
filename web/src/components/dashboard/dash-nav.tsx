"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, Image, KeyRound, LayoutDashboard, MessageSquareText, Radio, ScrollText, Settings, ShieldAlert, Users, WalletCards } from "lucide-react";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type NavigationItem = { href: string; label: string; icon: typeof LayoutDashboard };
type Workspace = { id: string; name: string; role?: string };

export function DashNav({ locale, user, className }: { locale: Locale; user: { permissions: string[] }; className?: string }) {
  const pathname = usePathname();
  const navigate = useNavigate();
  const nav = getDictionary(locale).dashboard.components.nav;
  const routeWorkspaceId = pathname.match(/\/dashboard\/w\/([^/]+)/)?.[1];
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch("/api/workspaces")
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (active) setWorkspaces(data?.data ?? []);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("capi:refresh", load);
    return () => {
      active = false;
      window.removeEventListener("capi:refresh", load);
    };
  }, []);

  // Keep workspace tools available from the dashboard landing page too.
  const workspaceId = routeWorkspaceId ?? workspaces[0]?.id;
  const generalItems: NavigationItem[] = [
    { href: "/dashboard", label: getDictionary(locale).dashboard.nav.overview, icon: LayoutDashboard },
  ];
  const workspaceOverview: NavigationItem | null = workspaceId ? { href: `/dashboard/w/${workspaceId}`, label: getDictionary(locale).dashboard.nav.overview, icon: LayoutDashboard } : null;
  const monitorItems: NavigationItem[] = workspaceId ? [
    { href: `/dashboard/w/${workspaceId}/multimedia`, label: nav.multimedia, icon: Image },
    { href: `/dashboard/w/${workspaceId}/logs`, label: getDictionary(locale).dashboard.nav.logs, icon: ScrollText },
    { href: `/dashboard/w/${workspaceId}/prompts`, label: nav.prompts, icon: MessageSquareText },
    { href: `/dashboard/w/${workspaceId}/files`, label: nav.files, icon: FolderOpen },
    { href: `/dashboard/w/${workspaceId}/routing-security`, label: nav.routingSecurity, icon: ShieldAlert },
  ] : [];
  const manageItems: NavigationItem[] = workspaceId ? [
    { href: `/dashboard/w/${workspaceId}/keys`, label: getDictionary(locale).dashboard.nav.keys, icon: KeyRound },
    { href: `/dashboard/w/${workspaceId}/members`, label: nav.members, icon: Users },
    { href: `/dashboard/w/${workspaceId}/billing`, label: nav.billing, icon: WalletCards },
    { href: `/dashboard/w/${workspaceId}/channels`, label: nav.channels, icon: Radio },
    { href: `/dashboard/w/${workspaceId}/settings`, label: nav.workspaceSettings, icon: Settings },
  ] : [];
  const workspaceItems: NavigationItem[] = workspaceOverview ? [workspaceOverview, ...monitorItems, ...manageItems] : [];
  const items: NavigationItem[] = routeWorkspaceId ? workspaceItems : generalItems;
  const title = routeWorkspaceId ? nav.workspace : nav.dashboard;
  const navLink = (item: NavigationItem) => {
    const href = localeHref(locale, item.href);
    const active = item.href === `/dashboard/w/${workspaceId}` || item.href === "/dashboard" || item.href === "/dashboard/admin" ? pathname === href : pathname.startsWith(href);
    return <Link key={item.href} href={href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors", active ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><item.icon className="size-4 shrink-0" />{item.label}</Link>;
  };

  if (className?.includes("flex-row")) return <nav aria-label={title}>
    <label className="flex items-center gap-3 text-xs font-medium text-muted-foreground">{title}
      <select aria-label={locale === "zh" ? "切换工作区页面" : "Switch workspace page"} className="h-10 min-w-0 flex-1 rounded-sm border border-input bg-background px-3 text-sm text-foreground" value={pathname} onChange={event => navigate(event.target.value)}>
        {!routeWorkspaceId && generalItems.map(item => <option key={item.href} value={localeHref(locale, item.href)}>{item.label}</option>)}
        {workspaceOverview && <option value={localeHref(locale, workspaceOverview.href)}>{workspaceOverview.label}</option>}
        {monitorItems.map(item => <option key={item.href} value={localeHref(locale, item.href)}>{item.label}</option>)}
        {manageItems.map(item => <option key={item.href} value={localeHref(locale, item.href)}>{item.label}</option>)}
        {user.permissions.includes("admin:access") && <option value={localeHref(locale, "/dashboard/admin")}>{nav.administrator}</option>}
      </select>
    </label>
  </nav>;

  return <nav aria-label={title} className={cn("flex flex-col gap-0.5", className)}>
    {routeWorkspaceId && workspaceOverview ? navLink(workspaceOverview) : items.map(navLink)}
    {routeWorkspaceId && monitorItems.map(navLink)}
    {routeWorkspaceId && manageItems.map(navLink)}
    {!routeWorkspaceId && workspaceItems.length > 0 && <>
      {workspaceOverview && navLink(workspaceOverview)}
      {monitorItems.map(navLink)}
      {manageItems.map(navLink)}
    </>}
    {user.permissions.includes("admin:access") && <Link href={localeHref(locale, "/dashboard/admin")} aria-label={nav.openAdministrator} className={cn("mt-4 flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors", pathname.startsWith(localeHref(locale, "/dashboard/admin")) ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Settings className="size-4 shrink-0" />{nav.administrator}</Link>}
  </nav>;
}
