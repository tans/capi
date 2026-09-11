import type { Metadata } from "next";

import {
  ClosingCta,
  FeatureGrid,
  PageHero,
} from "@/components/marketing/page-hero";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).teams;
  return { title: t.title, description: t.description };
}

export default async function TeamsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale).teams;
  const href = (path: string) => localeHref(locale, path);

  return (
    <>
      <PageHero
        locale={locale}
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        primary={{
          label: t.requestPack,
          href: href("/contact"),
        }}
        secondary={{
          label: getDictionary(locale).common.contactSales,
          href: href("/contact"),
        }}
      />

      <Section>
        <p className="eyebrow">{t.controls.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.controls.title}</h2>

        <FeatureGrid
          items={t.capabilities}
          columns={3}
          className="mt-12"
        />
      </Section>

      <Section>
        <p className="eyebrow">{t.controls.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.security.title}</h2>
        <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
          {t.security.body}
        </p>

        <div className="mt-10 flex flex-col divide-y divide-border rounded-md border border-border">
          {t.blocks.map((block) => (
            <div
              key={block.title}
              className="grid gap-4 px-6 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
            >
              <div className="text-[14px] font-semibold tracking-tight text-foreground">
                {block.title}
              </div>
              <div className="text-[13px] leading-relaxed text-muted-foreground">
                {block.body}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-center gap-4">
          <Button asChild variant="brand">
            <a href={href("/contact")}>{t.requestPack}</a>
          </Button>
        </div>
      </Section>

      <ClosingCta
        locale={locale}
        title={t.cta.title}
        description={t.cta.description}
        primary={{
          label: getDictionary(locale).common.getApiKey,
          href: href("/signup"),
        }}
        secondary={{
          label: getDictionary(locale).common.contactSales,
          href: href("/contact"),
        }}
      />
    </>
  );
}
