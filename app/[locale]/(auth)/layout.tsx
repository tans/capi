import Link from "next/link";

import { LanguageSegmented } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { site } from "@/lib/site";

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale);
  const href = (path: string) => localeHref(locale, path);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="container-page flex h-14 items-center justify-between">
          <Link href={href("/")} aria-label={t.common.homeAria}>
            <Logo />
          </Link>
          <div className="flex items-center gap-5">
            <Link
              href={href("/")}
              className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              {t.auth.backToSite}
            </Link>
            <LanguageSegmented locale={locale} />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        {children}
      </main>

      <footer className="border-t border-border bg-background">
        <div className="container-page flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} {site.name}. {t.common.allRightsReserved}
          </p>
          <div className="flex items-center gap-4">
            <Link
              href={href("/terms")}
              className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t.nav.terms}
            </Link>
            <Link
              href={href("/privacy")}
              className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t.nav.privacy}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
