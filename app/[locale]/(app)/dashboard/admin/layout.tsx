import { AdminNav } from "@/components/dashboard/admin-nav";
import { resolveLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = (await resolveLocale(params)) as Locale;
  return <div className="flex flex-col gap-6">
    <AdminNav locale={locale} />
    {children}
  </div>;
}
