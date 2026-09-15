"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Boxes, KeyRound, LayoutDashboard, Radio, Users, WalletCards } from "lucide-react";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const items = [
  ["/dashboard/admin", "overview", LayoutDashboard],
  ["/dashboard/admin/channels", "channels", Radio],
  ["/dashboard/admin/groups", "groups", Boxes],
  ["/dashboard/admin/users", "users", Users],
  ["/dashboard/admin/pricing", "pricing", WalletCards],
  ["/dashboard/admin/redeem-codes", "redeemCodes", KeyRound],
] as const;

export function AdminNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const locale = (pathname.match(/^\/([^/]+)/)?.[1] === "zh" ? "zh" : "en") as Locale;
  const t = getDictionary(locale).dashboard;
  return <nav aria-label={t.components.nav.administrator} className={cn("flex flex-col gap-0.5", className)}>
    <p className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground">{t.components.nav.administrator}</p>
    {items.map(([path, key, Icon]) => {
      const href = localeHref(locale, path);
      const active = path === "/dashboard/admin" ? pathname === href : pathname.startsWith(href);
      return <Link key={path} href={href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors", active ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-4 shrink-0" />{t.admin[key]}</Link>;
    })}
    <Link href={localeHref(locale, "/dashboard")} className="mt-4 flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ArrowLeft className="size-4 shrink-0" />{t.components.nav.backToWorkspace}</Link>
  </nav>;
}
