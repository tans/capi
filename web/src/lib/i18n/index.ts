import en from "./dictionaries/en";
import zh from "./dictionaries/zh";
import { defaultLocale, type Locale } from "./config";

export type { Dictionary } from "./dictionaries/en";

export const dictionaries: Record<Locale, typeof en> = { en, zh };

/**
 * Dictionaries are plain in-memory objects, so this is safe to call from both
 * server and client components without awaiting anything.
 */
export function getDictionary(locale: Locale | string | undefined) {
  if (locale === "zh") return dictionaries.zh;
  if (locale === "en") return dictionaries.en;
  return dictionaries[defaultLocale];
}

/** Fill `{placeholder}` slots in a dictionary string. */
export function interpolate(
  template: string,
  values: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
