"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
 Boxes,
  KeyRound,
  LayoutDashboard,
  Radio,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Users,
  WalletCards,
} from "lucide-react";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

export function DashNav({
  locale,
  user,
  className,
}: {
  locale: Locale;
  user: { permissions: string[] };
  className?: string;
}) {
  const pathname = usePathname();
  const dictionary = getDictionary(locale);
  const workspaceId = pathname.match(/\/dashboard\/w\/(\d+)/)?.[1];
  const zh = locale === "zh";
  const generalItems: NavigationItem[] = [
    { href: "/dashboard", label: dictionary.dashboard.nav.overview, icon: LayoutDashboard },
    { href: "/dashboard/keys", label: dictionary.dashboard.nav.keys, icon: KeyRound },
    { href: "/dashboard/logs", label: dictionary.dashboard.nav.logs, icon: ScrollText },
    { href: "/dashboard/models", label: dictionary.dashboard.nav.models, icon: LayoutDashboard },
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
  const title = workspaceId ? (zh ? "工作区" : "Workspace") : (zh ? "控制台" : "Dashboard");

  return <nav aria-label={title} className={cn("flex flex-col gap-0.5", className)}>
    <p className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground">{title}</p>
    {workspaceItems.map((item) => {
      const href = localeHref(locale, item.href);
      const active = item.href === `/dashboard/w/${workspaceId}` || item.href === "/dashboard" ? pathname === href : pathname.startsWith(href);
      return <Link key={item.href} href={href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors", active ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><item.icon className="size-4 shrink-0" />{item.label}</Link>;
    })}
    {user.permissions.includes("admin:access") && <details open className="group mt-4"><summary className="cursor-pointer list-none px-2.5 py-2 text-[13px] font-medium text-muted-foreground">{zh ? "管理员" : "Administrator"}</summary><div className="mt-0.5 ml-2 border-l border-border pl-2">{[["/dashboard/admin", zh ? "中转管理" : "Relay"], ["/dashboard/admin/users", zh ? "用户" : "Users"], ["/dashboard/admin/pricing", zh ? "模型收费" : "Model pricing"], ["/dashboard/admin/redeem-codes", zh ? "兑换码" : "Redeem codes"]].map(([path, label]) => { const href = localeHref(locale, path); const active = path === "/dashboard/admin" ? pathname === href : pathname.startsWith(href); return <Link key={path} href={href} aria-current={active ? "page" : undefined} className={cn("block rounded-sm px-2.5 py-2 text-[13px] transition-colors", active ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{label}</Link>; })}</div></details>}
  </nav>;
}
