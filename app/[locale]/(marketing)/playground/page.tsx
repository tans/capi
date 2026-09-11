import type { Metadata } from "next";

import { PageHero, Section } from "@/components/marketing/page-hero";
import { Playground } from "@/components/marketing/playground";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).playground;
  return { title: t.title, description: t.description };
}

export default async function PlaygroundPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await resolveLocale(params);
  const dict = getDictionary(locale);
  const t = dict.playground;
  const href = (path: string) => localeHref(locale as Locale, path);

  return (
    <>
      <PageHero
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        secondary={{
          label: dict.common.readTheDocs,
          href: href("/docs/guides/quickstart"),
        }}
      />

      <Section>
        <Playground locale={locale} />
      </Section>
    </>
  );
}
