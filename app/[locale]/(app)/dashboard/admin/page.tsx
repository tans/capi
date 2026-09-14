import type { Metadata } from "next";

import { AdminConsole } from "@/components/dashboard/admin-console";
import { AdminTools } from "@/components/dashboard/admin-tools";
import { resolveLocale } from "@/lib/i18n/server";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return { title: locale === "zh" ? "中转管理" : "Relay administration" };
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await resolveLocale(params);
  return <><AdminConsole locale={locale} /><AdminTools locale={locale} /></>;
}
