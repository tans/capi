import type { Metadata } from "next";

import { CodeBlock } from "@/components/code-block";
import {
  ClosingCta,
  FeatureGrid,
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
  const t = getDictionary(locale).cli;
  return { title: t.title, description: t.description };
}

const cliSnippets = [
  {
    label: "Generate",
    language: "bash",
    code: 'capi image generate --prompt "a quiet morning in kyoto"',
  },
  {
    label: "Stream",
    language: "bash",
    code: 'capi llm chat --model gpt-5.6 --message "summarise this week"',
  },
  {
    label: "JSON",
    language: "bash",
    code: "capi models list --modality video --json | jq '.[0].id'",
  },
];

export default async function CliPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale).cli;
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
          label: getDictionary(locale).common.readTheDocs,
          href: href("/docs/guides/cli/install"),
        }}
        code={
          <CodeBlock
            tabs={cliSnippets}
            className="border-ink-border bg-ink"
          />
        }
      />

      <Section>
        <p className="eyebrow">{t.commands.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.commands.title}</h2>

        <div className="mt-10 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t.commands.command}</th>
                <th className="px-4 py-3 font-medium">{t.commands.purpose}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {t.rows.map((row) => (
                <tr key={row.name}>
                  <td className="px-4 py-3 font-mono text-foreground">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.body}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section>
        <p className="eyebrow">{t.usage.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.usage.title}</h2>
        <FeatureGrid items={t.features} columns={2} className="mt-10" />
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
          href: href("/docs/guides/cli/install"),
        }}
      />
    </>
  );
}
