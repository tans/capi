"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Boxes, KeyRound, LayoutDashboard, Radio, Users, WalletCards } from "lucide-react";

import { localeHref, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const items = [
  ["/dashboard/admin", "中转管理", "Relay", LayoutDashboard],
  ["/dashboard/admin/channels", "渠道", "Channels", Radio],
  ["/dashboard/admin/groups", "分组", "Groups", Boxes],
  ["/dashboard/admin/users", "用户", "Users", Users],
  ["/dashboard/admin/pricing", "模型收费", "Model pricing", WalletCards],
  ["/dashboard/admin/redeem-codes", "兑换码", "Redeem codes", KeyRound],
] as const;

export function AdminNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const locale = (pathname.match(/^\/([^/]+)/)?.[1] === "zh" ? "zh" : "en") as Locale;
  return <nav aria-label={locale === "zh" ? "管理员" : "Administrator"} className={cn("flex flex-col gap-0.5", className)}>
    <p className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground">{locale === "zh" ? "管理员" : "Administrator"}</p>
    {items.map(([path, zh, en, Icon]) => {
      const href = localeHref(locale, path);
      const active = path === "/dashboard/admin" ? pathname === href : pathname.startsWith(href);
      return <Link key={path} href={href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors", active ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-4 shrink-0" />{locale === "zh" ? zh : en}</Link>;
    })}
    <Link href={localeHref(locale, "/dashboard")} className="mt-4 flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ArrowLeft className="size-4 shrink-0" />{locale === "zh" ? "返回工作区" : "Back to workspace"}</Link>
  </nav>;
}
