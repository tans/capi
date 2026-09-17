import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountForm } from "@/components/dashboard/account-form";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).dashboard.account;
  return { title: t.title, description: t.description };
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref(locale, "/login"));

  return (
    <AccountForm
      dict={getDictionary(locale).dashboard.account}
      locale={locale}
      user={{ name: user.name, email: user.email, createdAt: user.createdAt }}
    />
  );
}
