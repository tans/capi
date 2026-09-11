import type { Metadata } from "next";

import { CodeBlock } from "@/components/code-block";
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
  const t = getDictionary(locale).mcp;
  return { title: t.title, description: t.description };
}

const installSnippets = [
  {
    label: "Claude Code",
    language: "bash",
    code: 'claude mcp add capi --env CAPI_API_KEY=sk-... -- npx -y @capi/mcp',
  },
  {
    label: "Codex",
    language: "bash",
    code: "codex mcp add capi -- npx -y @capi/mcp",
  },
  {
    label: "Cursor / VS Code",
    language: "json",
    code: '{\n  "mcpServers": {\n    "capi": {\n      "command": "npx",\n      "args": ["-y", "@capi/mcp"],\n      "env": { "CAPI_API_KEY": "sk-..." }\n    }\n  }\n}',
  },
];

export default async function McpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale).mcp;
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
          href: href("/docs/guides/mcp/quickstart"),
        }}
        meta={
          <p className="font-mono text-[11px] text-muted-foreground">
            {t.meta}
          </p>
        }
        code={
          <CodeBlock
            tabs={installSnippets}
            className="border-ink-border bg-ink"
          />
        }
      />

      <Section>
        <p className="eyebrow">{t.targets.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.targets.title}</h2>
        <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
          {t.targetsDescription}
        </p>
        <FeatureGrid items={t.clients} className="mt-12" columns={3} />
      </Section>

      <Section>
        <p className="eyebrow">{t.tools.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.tools.title}</h2>

        <div className="mt-10 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t.tools.tool}</th>
                <th className="px-4 py-3 font-medium">{t.tools.purpose}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {t.toolRows.map((row) => (
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
        <p className="eyebrow">{t.setup.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.setup.title}</h2>
        <Steps items={t.setupSteps} className="mt-10" />
      </Section>

      <Section>
        <p className="eyebrow">{t.explore.eyebrow}</p>
        <h2 className="display-2 mt-3 text-foreground">{t.explore.title}</h2>
        <FeatureGrid
          items={t.exploreCards.map((card) => ({ ...card }))}
          className="mt-10"
        />
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
