"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, FolderOpen, FlaskConical, KeyRound, LayoutDashboard, MessageSquareText, Radio, ScrollText, Settings, ShieldAlert, SlidersHorizontal, Users, WalletCards } from "lucide-react";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type NavigationItem = { href: string; label: string; icon: typeof LayoutDashboard };
type Workspace = { id: string; name: string; role?: string };

export function DashNav({ locale, user, className }: { locale: Locale; user: { permissions: string[] }; className?: string }) {
  const pathname = usePathname();
  const nav = getDictionary(locale).dashboard.components.nav;
  const routeWorkspaceId = pathname.match(/\/dashboard\/w\/([^/]+)/)?.[1];
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [openGroup, setOpenGroup] = useState<"monitor" | "manage">("monitor");

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

  useEffect(() => {
    setOpenGroup(/\/dashboard\/w\/[^/]+\/(keys|members|billing|channels|settings)(?:\/|$)/.test(pathname) ? "manage" : "monitor");
  }, [pathname]);

  // Keep workspace tools available from the dashboard landing page too.
  const workspaceId = routeWorkspaceId ?? workspaces[0]?.id;
  // Model eval is admin/owner-only; hide the entry for members.
  const isWorkspaceAdmin = ["owner", "admin"].includes(routeWorkspaceId ? workspaces.find(w => w.id === routeWorkspaceId)?.role ?? "" : workspaces[0]?.role ?? "");
  const generalItems: NavigationItem[] = [
    { href: "/dashboard", label: getDictionary(locale).dashboard.nav.overview, icon: LayoutDashboard },
  ];
  const workspaceOverview: NavigationItem | null = workspaceId ? { href: `/dashboard/w/${workspaceId}`, label: getDictionary(locale).dashboard.nav.overview, icon: LayoutDashboard } : null;
  const monitorItems: NavigationItem[] = workspaceId ? [
    { href: `/dashboard/w/${workspaceId}/logs`, label: getDictionary(locale).dashboard.nav.logs, icon: ScrollText },
    { href: `/dashboard/w/${workspaceId}/prompts`, label: nav.prompts, icon: MessageSquareText },
    { href: `/dashboard/w/${workspaceId}/files`, label: nav.files, icon: FolderOpen },
    { href: `/dashboard/w/${workspaceId}/routing-security`, label: nav.routingSecurity, icon: ShieldAlert },
    ...(isWorkspaceAdmin ? [{ href: `/dashboard/w/${workspaceId}/model-eval`, label: nav.modelEval, icon: FlaskConical }] : []),
    { href: `/dashboard/w/${workspaceId}/usage`, label: nav.usageAnalytics, icon: SlidersHorizontal },
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

  const group = (key: "monitor" | "manage", label: string, groupItems: NavigationItem[]) => <div className="mt-2 first:mt-0 min-w-max" key={key}>
    <button type="button" className="flex w-full items-center justify-between px-2.5 py-1 text-[11px] font-medium tracking-wide text-muted-foreground hover:text-foreground" onClick={() => setOpenGroup(value => value === key ? (key === "monitor" ? "manage" : "monitor") : key)} aria-expanded={openGroup === key}><span>{label}</span><ChevronDown className={cn("size-3 transition-transform", openGroup === key && "rotate-180")} /></button>
    <div className={cn("flex flex-col gap-0.5", openGroup !== key && "hidden")}>{groupItems.map(navLink)}</div>
  </div>;

  return <nav aria-label={title} className={cn("flex flex-col gap-0.5", className)}>
    <p className={cn("px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground", className?.includes("flex-row") && "hidden")}>{title}</p>
    {routeWorkspaceId && workspaceOverview ? navLink(workspaceOverview) : items.map(navLink)}
    {routeWorkspaceId && group("monitor", nav.monitorGroup, monitorItems)}
    {routeWorkspaceId && group("manage", nav.manageGroup, manageItems)}
    {!routeWorkspaceId && workspaceItems.length > 0 && <>
      <p className={cn("mt-4 px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground", className?.includes("flex-row") && "hidden")}>{nav.workspace}</p>
      {workspaceOverview && navLink(workspaceOverview)}
      {group("monitor", nav.monitorGroup, monitorItems)}
      {group("manage", nav.manageGroup, manageItems)}
    </>}
    {user.permissions.includes("admin:access") && <Link href={localeHref(locale, "/dashboard/admin")} aria-label={nav.openAdministrator} className={cn("mt-4 flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors", pathname.startsWith(localeHref(locale, "/dashboard/admin")) ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Settings className="size-4 shrink-0" />{nav.administrator}</Link>}
  </nav>;
}
