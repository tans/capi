"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { localeHref, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export function AdminNav({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const items = [
    ["/dashboard/admin", locale === "zh" ? "中转管理" : "Relay"],
    ["/dashboard/admin/users", locale === "zh" ? "用户" : "Users"],
    ["/dashboard/admin/pricing", locale === "zh" ? "模型收费" : "Model pricing"],
    ["/dashboard/admin/redeem-codes", locale === "zh" ? "兑换码" : "Redeem codes"],
  ] as const;

  return <nav aria-label={locale === "zh" ? "管理员栏目" : "Administration sections"} className="tabs tabs-boxed w-fit max-w-full overflow-x-auto">
    {items.map(([path, label]) => {
      const href = localeHref(locale, path);
      const active = path === "/dashboard/admin" ? pathname === href : pathname.startsWith(href);
      return <Link key={path} href={href} aria-current={active ? "page" : undefined} className={cn("tab whitespace-nowrap text-xs", active && "tab-active font-medium")}>{label}</Link>;
    })}
  </nav>;
}
