import type { Metadata } from "next";

import { RelaySettings } from "@/components/dashboard/relay-settings";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return { title: locale === "zh" ? "中转设置" : "Relay settings" };
}

export default async function AdminSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  return <RelaySettings locale={locale} />;
}
