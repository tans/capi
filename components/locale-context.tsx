"use client";

import * as React from "react";

import type { Locale } from "@/lib/i18n/config";

/**
 * Shares the active locale with client components deep in the tree.
 *
 * Needed because some leaf components (code panels, toasts) render before
 * hydration and cannot receive a prop through every intermediate page.
 * Server components pass the value once, in the locale layout.
 */
const LocaleContext = React.createContext<Locale | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

/** Falls back to reading `<html lang>` when no provider is mounted. */
export function useLocale(): Locale {
  const fromContext = React.useContext(LocaleContext);
  const fromDom = React.useSyncExternalStore(
    subscribeToLang,
    readLang,
    () => "en" as Locale,
  );

  return fromContext ?? fromDom;
}

function subscribeToLang(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
  return () => observer.disconnect();
}

function readLang(): Locale {
  return document.documentElement.lang.toLowerCase().startsWith("zh")
    ? "zh"
    : "en";
}
