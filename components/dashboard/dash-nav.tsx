"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  KeyRound,
  LayoutDashboard,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const items = [
  { key: "overview" as const, href: "/dashboard", icon: LayoutDashboard },
  { key: "keys" as const, href: "/dashboard/keys", icon: KeyRound },
  { key: "usage" as const, href: "/dashboard/usage", icon: BarChart3 },
  { key: "models" as const, href: "/dashboard/models", icon: Boxes },
  { key: "settings" as const, href: "/dashboard/settings", icon: Settings },
];

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
  const t = getDictionary(locale);

  return (
    <nav className={cn("flex flex-col gap-0.5", className)}>
      {items.map((item) => {
        const href = localeHref(locale, item.href);
        const active =
          item.href === "/dashboard"
            ? pathname === href
            : pathname.startsWith(href);

        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "bg-brand-muted font-medium text-brand"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {t.dashboard.nav[item.key]}
          </Link>
        );
      })}
      {user.permissions.includes("admin:access") && <details open className="group mt-3">
        <summary className="cursor-pointer list-none px-2.5 py-2 text-[13px] font-medium text-muted-foreground">{locale === "zh" ? "管理员" : "Administrator"}</summary>
        <div className="mt-0.5 ml-2 border-l border-border pl-2">
          {[["/dashboard/admin", locale === "zh" ? "中转管理" : "Relay"], ["/dashboard/admin#pricing", locale === "zh" ? "模型收费" : "Model pricing"], ["/dashboard/admin#users", locale === "zh" ? "用户" : "Users"], ["/dashboard/admin#redeem-codes", locale === "zh" ? "兑换码" : "Redeem codes"]].map(([path, label]) => {
            const href = localeHref(locale, path);
            return <Link key={path} href={href} className={cn("block rounded-sm px-2.5 py-2 text-[13px] transition-colors", pathname === href ? "bg-brand-muted font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{label}</Link>;
          })}
        </div>
      </details>}
    </nav>
  );
}
