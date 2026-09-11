import type { Metadata } from "next";

import {
  ClosingCta,
  FeatureGrid,
  PageHero,
  Steps,
} from "@/components/marketing/page-hero";
import { Section } from "@/components/section";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).skills;
  return { title: t.title, description: t.description };
}

export default async function SkillsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale).skills;
  const href = (path: string) => localeHref(locale, path);

  return (
    <>
      <PageHero
        locale={locale}
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        primary={{
          label: t.primaryCta,
          href: href("/docs/skills"),
        }}
        secondary={{
          label: getDictionary(locale).common.readTheDocs,
          href: href("/docs/guides/skills/install"),
        }}
      />

      <Section>
        <p className="eyebrow">{t.why.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.why.title}</h2>
        <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
          {t.whyDescription}
        </p>
        <FeatureGrid items={t.whyCards} columns={2} className="mt-10" />
      </Section>

      <Section>
        <p className="eyebrow">{t.install.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.install.title}</h2>
        <Steps items={t.installSteps} className="mt-10" />
      </Section>

      <Section>
        <p className="eyebrow">{t.catalogue.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">
          {t.catalogue.title}
        </h2>

        <ul className="mt-10 flex flex-col divide-y divide-border rounded-md border border-border">
          {t.catalogueItems.map((item) => (
            <li
              key={item.title}
              className="grid gap-2 px-5 py-5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_minmax(0,3fr)] sm:items-center"
            >
              <div className="text-[14px] font-semibold tracking-tight text-foreground">
                {item.title}
              </div>
              <div className="font-mono text-[11px] tracking-wider text-muted-foreground">
                {item.meta}
              </div>
              <div className="text-[13px] leading-relaxed text-muted-foreground">
                {item.body}
              </div>
            </li>
          ))}
        </ul>
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
          label: getDictionary(locale).common.readTheDocs,
          href: href("/docs/skills"),
        }}
      />
    </>
  );
}
