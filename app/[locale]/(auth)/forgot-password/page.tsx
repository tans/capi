import type { Metadata } from "next";

import { PasswordResetForm } from "@/components/auth/password-reset-form";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await params;
  return { title: getDictionary(locale.locale).auth.reset.title };
}

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await resolveLocale(params)) as Locale;
  const dict = getDictionary(locale).auth;
  return <div className="w-full max-w-sm">
    <h1 className="display-3 text-foreground">{dict.reset.title}</h1>
    <p className="mt-2 text-[13px] text-muted-foreground">{dict.reset.description}</p>
    <div className="mt-8"><PasswordResetForm dict={dict} localePrefix={`/${locale}`} /></div>
  </div>;
}
