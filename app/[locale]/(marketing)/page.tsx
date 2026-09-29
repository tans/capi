import { Hero } from "@/components/home/hero";
import { resolveLocale } from "@/lib/i18n/server";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await resolveLocale(params);

  return (
    <Hero locale={locale} />
  );
}
