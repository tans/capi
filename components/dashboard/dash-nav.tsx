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
  className,
}: {
  locale: Locale;
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
      <Link
        href={localeHref(locale, "/dashboard/admin")}
        aria-current={pathname.startsWith(localeHref(locale, "/dashboard/admin")) ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors",
          pathname.startsWith(localeHref(locale, "/dashboard/admin"))
            ? "bg-brand-muted font-medium text-brand"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <ShieldCheck className="size-4 shrink-0" />
        {locale === "zh" ? "中转管理" : "Administration"}
      </Link>
    </nav>
  );
}
