"use client";

import { usePathname } from "next/navigation";

import { AdminNav } from "@/components/dashboard/admin-nav";
import { DashNav } from "@/components/dashboard/dash-nav";
import type { Locale } from "@/lib/i18n/config";

export function AppSidebar({ locale, user, className }: { locale: Locale; user: { permissions: string[] }; className?: string }) {
  const pathname = usePathname();
  return pathname.includes("/dashboard/admin")
    ? <AdminNav className={className} />
    : <DashNav locale={locale} user={user} className={className} />;
}
