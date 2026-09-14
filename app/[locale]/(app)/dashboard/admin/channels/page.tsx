import type { Metadata } from "next";

import { AdminConsole } from "@/components/dashboard/admin-console";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return { title: locale === "zh" ? "渠道" : "Channels" };
}

export default async function AdminChannelsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  return <AdminConsole locale={locale} section="channels" />;
}
