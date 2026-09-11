import type { Metadata } from "next";

import { SettingsForm } from "@/components/dashboard/settings-form";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).dashboard.settings;
  return { title: t.title, description: t.description };
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const dict = getDictionary(locale).dashboard.settings;

  return <SettingsForm dict={dict} locale={locale} />;
}
