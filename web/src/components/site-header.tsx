"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Menu, UserRound } from "lucide-react";

import { LanguageSwitcher, useLocaleSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
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
import { mainNav } from "@/lib/site";
import { cn } from "@/lib/utils";

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

export function SiteHeader({ locale }: { locale: Locale }) {
  const [open, setOpen] = React.useState(false);
  const t = getDictionary(locale);
  const href = (path: string) => localeHref(locale, path);
  const switchLocale = useLocaleSwitcher(locale);

  const onSwitchLocale = React.useCallback(
    (next: Locale) => {
      setOpen(false);
      switchLocale(next);
    },
    [switchLocale],
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container-page">
        <div className="flex h-14 items-center justify-between gap-6">
          <div className="flex items-center gap-7">
            <Link href={href("/")} aria-label={t.common.homeAria}>
              <Logo />
            </Link>
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
                <UserRound className="size-4" aria-hidden="true" />
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
              <SheetContent
                side="right"
                closeLabel={t.common.close}
                className="w-[86%] max-w-sm p-0"
              >
                <SheetHeader>
                  <SheetTitle className="sr-only">
                    {t.common.menuTitle}
                  </SheetTitle>
                  <Logo />
                </SheetHeader>
                <div className="flex flex-col gap-6 overflow-y-auto px-6 pb-8">
                  <div className="flex flex-col gap-3">
                    <p className="eyebrow">{t.common.switchLanguage}</p>
                    <div className="flex gap-2">
                      {locales.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => onSwitchLocale(item)}
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

      </div>
    </header>
  );
}
