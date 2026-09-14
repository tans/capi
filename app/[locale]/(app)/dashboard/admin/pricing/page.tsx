import type { Metadata } from "next";
import { AdminTools } from "@/components/dashboard/admin-tools";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return { title: locale === "zh" ? "模型收费" : "Model pricing" };
}

export default async function AdminPricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  return <AdminTools locale={locale} section="pricing" />;
}
