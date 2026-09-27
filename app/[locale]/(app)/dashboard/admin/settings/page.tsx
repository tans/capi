import type { Metadata } from "next";

import { EmailSettings } from "@/components/dashboard/email-settings";
import { RelaySettings } from "@/components/dashboard/relay-settings";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return { title: locale === "zh" ? "系统设置" : "System settings" };
}

export default async function AdminSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  return <div className="flex flex-col gap-8"><RelaySettings locale={locale} /><EmailSettings locale={locale} /></div>;
}
