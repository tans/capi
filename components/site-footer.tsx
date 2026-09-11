import Link from "next/link";

import { Logo } from "@/components/logo";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { footerNav, site } from "@/lib/site";

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const href = (path: string) => localeHref(locale, path);

  return (
    <footer className="border-t border-border">
      <div className="container-page py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              {t.common.footerTagline}
            </p>
            <p className="mt-6 font-mono text-[11px] tracking-wider text-muted-foreground">
              {site.domain}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
            {footerNav.map((group) => (
              <div key={group.titleKey}>
                <p className="eyebrow">{t.nav[group.titleKey]}</p>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {group.links.map((link) => (
                    <li key={link.href + link.key}>
                      <Link
                        href={href(link.href)}
                        className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t.nav[link.key]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} {site.name}. {t.common.allRightsReserved}
          </p>
          <div className="flex items-center gap-5">
            <Link
              href={href("/terms")}
              className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.nav.terms}
            </Link>
            <Link
              href={href("/privacy")}
              className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.nav.privacy}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
