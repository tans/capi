import type { Metadata } from "next";

import { KeyManager } from "@/components/dashboard/key-manager";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).dashboard.keys;
  return { title: t.title, description: t.description };
}

export default async function KeysPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const dict = getDictionary(locale).dashboard.keys;
  return <KeyManager dict={dict} locale={locale} />;
}
