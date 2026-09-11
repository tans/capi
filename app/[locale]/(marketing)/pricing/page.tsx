import type { Metadata } from "next";

import {
  ClosingCta,
  PageHero,
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
  const t = getDictionary(locale).pricing;
  return { title: t.title, description: t.description };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale).pricing;
  const href = (path: string) => localeHref(locale, path);

  return (
    <>
      <PageHero
        locale={locale}
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        primary={{
          label: getDictionary(locale).common.getApiKey,
          href: href("/signup"),
        }}
        secondary={{
          label: getDictionary(locale).common.contactSales,
          href: href("/contact"),
        }}
      />

      <Section>
        <p className="eyebrow">{t.units.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.units.title}</h2>
        <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
          {t.unitsDescription}
        </p>

        <div className="mt-10 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t.table.modality}</th>
                <th className="px-4 py-3 font-medium">{t.table.unit}</th>
                <th className="px-4 py-3 font-medium">{t.table.example}</th>
                <th className="px-4 py-3 text-right font-medium">
                  {t.table.from}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {t.rows.map((row) => (
                <tr key={row.modality}>
                  <td className="px-4 py-3 text-foreground">{row.modality}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.unit}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                    {row.example}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] text-foreground">
                    {row.from}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section>
        <p className="eyebrow">{t.included.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">
          {t.included.title}
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
          {t.includedDescription}
        </p>

        <ul className="mt-10 flex flex-col divide-y divide-border rounded-md border border-border">
          {t.includedItems.map((item) => (
            <li
              key={item}
              className="px-5 py-4 text-[14px] leading-relaxed text-foreground"
            >
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <p className="eyebrow">{t.units.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">
          {t.included.title}
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
          {t.includedDescription}
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {t.notes.map((note) => (
            <div
              key={note.title}
              className="rounded-md border border-border bg-card p-6"
            >
              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                {note.title}
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                {note.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-md border border-brand/30 bg-brand-muted/40 p-6">
          <h3 className="text-[16px] font-semibold tracking-tight text-foreground">
            {t.volume.title}
          </h3>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            {t.volume.body}
          </p>
          <a
            href={href("/contact")}
            className="mt-5 inline-flex text-[13px] font-medium text-brand underline-offset-4 hover:underline"
          >
            {getDictionary(locale).common.contactSales} →
          </a>
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
