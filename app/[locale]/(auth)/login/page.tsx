import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).auth.login;
  return { title: t.title, description: t.description };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const dict = getDictionary(locale).auth;
  const localePrefix = `/${locale}`;

  return (
    <div className="w-full max-w-sm">
      <h1 className="display-3 text-foreground">{dict.login.title}</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {dict.login.description}
      </p>
      <div className="mt-8">
        <AuthForm mode="login" dict={dict} localePrefix={localePrefix} />
      </div>
    </div>
  );
}
