export const locales = ["en", "zh"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Label shown in the language switcher. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "简体中文",
};

/** Short tag used in the header button, e.g. "EN" / "中文". */
export const localeShortNames: Record<Locale, string> = {
  en: "ENGLISH",
  zh: "中文",
};

export const htmlLang: Record<Locale, string> = {
  en: "en",
  zh: "zh-CN",
};

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value);
}

/**
 * Prefix a path with a locale, leaving external URLs and hashes untouched.
 * Used for every in-app link so navigation stays inside the active language.
 */
export function localeHref(locale: Locale, path: string) {
  if (!path.startsWith("/")) return path;
  if (path.startsWith("//")) return path;
  // Split off hash and query so they stay attached to the path.
  const match = /^([^?#]*)(.*)$/.exec(path);
  const pathname = match?.[1] ?? path;
  const suffix = match?.[2] ?? "";
  const normalized = pathname === "/" ? "" : pathname;
  return `/${locale}${normalized}${suffix}`;
}
