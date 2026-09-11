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
  const t = getDictionary(locale).sdk;
  return { title: t.title, description: t.description };
}

const sdkSnippets = [
  {
    label: "Python",
    language: "python",
    code: 'from capi import Capi\ncapi = Capi()\nresult = capi.image.generate(prompt="a poster for a sci-fi short")\nprint(result.url)',
  },
  {
    label: "Node",
    language: "typescript",
    code: 'import { Capi } from "@capi/sdk";\nconst capi = new Capi();\nconst { url } = await capi.image.generate({ prompt: "a poster for a sci-fi short" });',
  },
  {
    label: "Go",
    language: "go",
    code: 'capi := capi.New(os.Getenv("CAPI_API_KEY"))\nout, err := capi.Image.Generate(ctx, "a poster for a sci-fi short")',
  },
];

export default async function SdkPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale).sdk;
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
          href: href("/docs/sdks"),
        }}
        code={
          <CodeBlock
            tabs={sdkSnippets}
            className="border-ink-border bg-ink"
          />
        }
      />

      <Section>
        <p className="eyebrow">{t.languages.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.languages.title}</h2>
        <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
          {t.languagesDescription}
        </p>
        <FeatureGrid items={t.clients} columns={3} className="mt-10" />
      </Section>

      <Section>
        <p className="eyebrow">{t.options.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.options.title}</h2>

        <div className="mt-10 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t.options.option}</th>
                <th className="px-4 py-3 font-medium">{t.options.behaviour}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {t.optionRows.map((row) => (
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
        <p className="eyebrow">{t.errorTitle}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.compatTitle}</h2>
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
          href: href("/docs/sdks"),
        }}
      />
    </>
  );
}
