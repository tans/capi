"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { locales, localeNames, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export const LOCALE_COOKIE = "CAPI_LOCALE";

/**
 * Swap the locale while staying on the same page.
 *
 * Writes the cookie first so the server components pick up the new language,
 * then pushes the rewritten path (the leading locale segment is replaced).
 */
export function useLocaleSwitcher(locale: Locale) {
  const pathname = usePathname();
  const router = useRouter();

  return React.useCallback(
    (next: Locale) => {
      if (next === locale) return;
      const rest = pathname.replace(/^\/(en|zh)(?=\/|$)/, "");
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
      router.push(`/${next}${rest}`);
      router.refresh();
    },
    [locale, pathname, router],
  );
}

/** Dropdown version — used in the marketing header and the dashboard bar. */
export function LanguageSwitcher({
  locale,
  className,
  compact = false,
}: {
  locale: Locale;
  className?: string;
  /** Narrower label and tighter padding, for toolbars. */
  compact?: boolean;
}) {
  const switchTo = useLocaleSwitcher(locale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1 font-mono tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground",
          compact ? "text-[10px]" : "text-[11px]",
          className,
        )}
      >
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

/**
 * Segmented version — two buttons side by side. Used where a dropdown would
 * fight for space, e.g. the login page header.
 */
export function LanguageSegmented({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  const switchTo = useLocaleSwitcher(locale);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {locales.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => switchTo(item)}
          aria-pressed={item === locale}
          className={cn(
            "rounded-sm border px-2.5 py-1 font-mono text-[10px] tracking-wider uppercase transition-colors",
            item === locale
              ? "border-transparent bg-ink text-white"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {localeNames[item]}
        </button>
      ))}
    </div>
  );
}
