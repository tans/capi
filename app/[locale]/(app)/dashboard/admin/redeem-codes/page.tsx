import type { Metadata } from "next";
import { AdminTools } from "@/components/dashboard/admin-tools";
import { getDictionary } from "@/lib/i18n";
import { resolveLocale } from "@/lib/i18n/server";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return { title: getDictionary(locale).dashboard.admin.redeemCodes };
}

export default async function AdminCodesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  return <AdminTools locale={locale} section="codes" />;
}
