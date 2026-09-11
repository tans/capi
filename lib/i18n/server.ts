import { notFound } from "next/navigation";

import { isLocale, type Locale } from "./config";

/** Validate the `[locale]` segment, or 404. Shared by every locale layout. */
export async function resolveLocale(
  params: Promise<{ locale: string }>,
): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}
