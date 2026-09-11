"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Check, ChevronDown, Menu } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getDictionary } from "@/lib/i18n";
import {
  localeHref,
  locales,
  localeNames,
  type Locale,
} from "@/lib/i18n/config";
import { mainNav, modalityNav, toolNav } from "@/lib/site";
import { cn } from "@/lib/utils";

const LOCALE_COOKIE = "CAPI_LOCALE";

function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "text-[13px] text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function LanguageSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const router = useRouter();

  const switchTo = React.useCallback(
    (next: Locale) => {
      if (next === locale) return;
      // Swap the leading locale segment and stay on the same page.
      const rest = pathname.replace(/^\/(en|zh)(?=\/|$)/, "");
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
      router.push(`/${next}${rest}`);
      router.refresh();
    },
    [locale, pathname, router],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground">
        {localeNames[locale]}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {locales.map((item) => (
          <DropdownMenuItem
            key={item}
            onSelect={() => switchTo(item)}
            className="flex items-center justify-between"
          >
            {localeNames[item]}
            {item === locale ? <Check className="size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteHeader({ locale }: { locale: Locale }) {
  const [open, setOpen] = React.useState(false);
  const t = getDictionary(locale);
  const href = (path: string) => localeHref(locale, path);
  const pathname = usePathname();
  const router = useRouter();

  const switchLocale = React.useCallback(
    (next: Locale) => {
      setOpen(false);
      if (next === locale) return;
      const rest = pathname.replace(/^\/(en|zh)(?=\/|$)/, "");
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
      router.push(`/${next}${rest}`);
      router.refresh();
    },
    [locale, pathname, router],
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container-page">
        <div className="flex h-14 items-center justify-between gap-6">
          <div className="flex items-center gap-7">
            <Link href={href("/")} aria-label={t.common.homeAria}>
              <Logo />
            </Link>
            <nav className="hidden items-center gap-6 lg:flex">
              {modalityNav.map((item) => (
                <NavLink key={item.href} href={href(item.href)}>
                  {t.nav[item.key]}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <nav className="hidden items-center gap-6 md:flex">
              {mainNav.map((item) => (
                <NavLink key={item.href} href={href(item.href)}>
                  {t.nav[item.key]}
                </NavLink>
              ))}
            </nav>

            <div className="hidden items-center gap-3 md:flex">
              <LanguageSwitcher locale={locale} />

              <button
                type="button"
                aria-label={t.common.notificationsAria}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Bell className="size-[17px]" />
              </button>

              <Link
                href={href("/dashboard")}
                aria-label={t.common.accountAria}
                className="flex size-7 items-center justify-center rounded-full bg-ink font-mono text-[10px] font-medium text-white"
              >
                CA
              </Link>
            </div>

            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label={t.common.openMenuAria}
                  className="text-muted-foreground md:hidden"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[86%] max-w-sm p-0">
                <SheetHeader>
                  <SheetTitle className="sr-only">
                    {t.common.menuTitle}
                  </SheetTitle>
                  <Logo />
                </SheetHeader>
                <div className="flex flex-col gap-6 overflow-y-auto px-6 pb-8">
                  <div className="flex flex-col gap-3">
                    <p className="eyebrow">{t.nav.models}</p>
                    {modalityNav.map((item) => (
                      <Link
                        key={item.href}
                        href={href(item.href)}
                        onClick={() => setOpen(false)}
                        className="text-sm text-foreground"
                      >
                        {t.nav[item.key]}
                      </Link>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3">
                    <p className="eyebrow">{t.common.platformLabel}</p>
                    {[...mainNav, ...toolNav].map((item) => (
                      <Link
                        key={item.href}
                        href={href(item.href)}
                        onClick={() => setOpen(false)}
                        className="text-sm text-foreground"
                      >
                        {t.nav[item.key]}
                      </Link>
                    ))}
                  </div>

                  <div className="flex flex-col gap-3">
                    <p className="eyebrow">{t.common.switchLanguage}</p>
                    <div className="flex gap-2">
                      {locales.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => switchLocale(item)}
                          className={cn(
                            "rounded-sm border px-3 py-1.5 text-[13px]",
                            item === locale
                              ? "border-transparent bg-ink text-white"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {localeNames[item]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button asChild size="lg">
                      <Link href={href("/signup")} onClick={() => setOpen(false)}>
                        {t.common.getApiKey}
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg">
                      <Link href={href("/login")} onClick={() => setOpen(false)}>
                        {t.common.signIn}
                      </Link>
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="hidden h-11 items-center justify-center gap-6 border-t border-border/70 md:flex">
          {toolNav.map((item) => (
            <NavLink key={item.href} href={href(item.href)}>
              {t.nav[item.key]}
            </NavLink>
          ))}
        </div>
      </div>
    </header>
  );
}
