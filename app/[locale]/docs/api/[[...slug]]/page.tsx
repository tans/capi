import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CodeBlock, CodeResponse } from "@/components/code-block";
import { CopyPageActions } from "@/components/docs/copy-page";
import { DocsBreadcrumb } from "@/components/docs/docs-shell";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiEndpoints, apiNav, getEndpoint } from "@/lib/api-spec";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export function generateStaticParams() {
  return apiEndpoints.map((endpoint) => ({
    slug: endpoint.slug.split("/"),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug?: string[] }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!slug || slug.length === 0) {
    const t = getDictionary(locale).docs.apiOverview;
    return { title: t.title, description: t.description };
  }

  const endpoint = getEndpoint(slug.join("/"));
  if (!endpoint) return { title: "Not found" };
  return { title: endpoint.title, description: endpoint.summary };
}

/** Numbered section heading used throughout the reference body. */
function SectionNumber({ n, title }: { n: string; title: string }) {
  return (
    <h2 className="flex items-center gap-3 text-[18px] font-semibold tracking-tight text-foreground">
      <span className="font-mono text-[12px] font-medium text-muted-foreground">
        {n}
      </span>
      {title}
    </h2>
  );
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "rounded-[3px] px-2 py-1 font-mono text-[10px] font-semibold tracking-wider",
        method === "GET"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-orange-50 text-orange-700",
      )}
    >
      {method}
    </span>
  );
}

function Overview({
  locale,
  localePrefix,
}: {
  locale: Locale;
  localePrefix: string;
}) {
  const dict = getDictionary(locale);
  const t = dict.docs.apiOverview;
  const sidebarLabels = {
    search: dict.docs.sidebar.searchPlaceholder,
    noResults: dict.docs.sidebar.noResults,
    groups: dict.docs.tabs,
  };

  return (
    <div className="container-docs">
      <div className="grid gap-10 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-[6.5rem] max-h-[calc(100vh-8rem)] overflow-y-auto py-8 pr-2">
            <DocsSidebar labels={sidebarLabels} localePrefix={localePrefix} />
          </div>
        </aside>

        <main className="min-w-0 py-8 lg:py-10">
          <DocsBreadcrumb
            items={[
              { label: dict.nav.documentation, href: `${localePrefix}/docs` },
              { label: t.title },
            ]}
          />
          <h1 className="display-1 mt-5 text-foreground">{t.title}</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {t.description}
          </p>

          <div className="mt-12 flex flex-col gap-10">
            {apiNav.map((group) => (
              <div key={group.group}>
                <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                  {group.group}
                </h2>
                <div className="mt-4 flex flex-col gap-6">
                  {group.providers.map((provider) => (
                    <div key={provider.provider}>
                      <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                        {provider.provider}
                      </p>
                      <div className="mt-2.5 flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
                        {provider.endpoints.map((endpoint) => (
                          <Link
                            key={endpoint.slug}
                            href={`${localePrefix}/docs/api/${endpoint.slug}`}
                            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                          >
                            <MethodBadge method={endpoint.method} />
                            <span className="text-[13px] font-medium text-foreground">
                              {endpoint.title}
                            </span>
                            <span className="ml-auto hidden truncate font-mono text-[11px] text-muted-foreground sm:block">
                              {endpoint.path}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

export default async function ApiPage({
  params,
}: {
  params: Promise<{ locale: string; slug?: string[] }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const { slug } = await params;
  const localePrefix = `/${locale}`;
  const dict = getDictionary(locale);

  if (!slug || slug.length === 0)
    return <Overview locale={locale} localePrefix={localePrefix} />;

  const endpoint = getEndpoint(slug.join("/"));
  if (!endpoint) notFound();

  const t = dict.docs.api;
  const overviewT = dict.docs.apiOverview;

  const markdown = `# ${endpoint.title}

${endpoint.summary}

\`${endpoint.method} ${endpoint.path}\`

## ${t.overview}

${endpoint.overview}

## Example

\`\`\`${endpoint.example[0]?.language ?? "bash"}
${endpoint.example[0]?.code ?? ""}
\`\`\`

## Response

\`\`\`json
${endpoint.responseBody}
\`\`\`
`;

  return (
    <div className="container-docs">
      <div className="grid gap-10 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-[6.5rem] max-h-[calc(100vh-8rem)] overflow-y-auto py-8 pr-2">
            <DocsSidebar
              labels={{
                search: dict.docs.sidebar.searchPlaceholder,
                noResults: dict.docs.sidebar.noResults,
                groups: dict.docs.tabs,
              }}
              localePrefix={localePrefix}
            />
          </div>
        </aside>

        <main className="min-w-0 py-8 lg:py-10">
          <DocsBreadcrumb
            items={[
              { label: dict.nav.documentation, href: `${localePrefix}/docs` },
              {
                label: overviewT.title,
                href: `${localePrefix}/docs/api`,
              },
              { label: endpoint.group, href: `${localePrefix}/docs/api` },
            ]}
          />

          <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
            <div>
              <h1 className="display-1 text-foreground">{endpoint.title}</h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                {endpoint.summary}
              </p>
            </div>
            <CopyPageActions
              slug={`api/${endpoint.slug}`}
              markdown={markdown}
              copyLabel={dict.common.copyPage}
              viewLabel={dict.common.viewMarkdown}
              localePrefix={localePrefix}
            />
          </div>

          <div className="mt-10 grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-10">
              <div>
                <SectionNumber n="01" title={t.overview} />
                <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
                  {endpoint.overview}
                </p>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-4 py-3">
                  <MethodBadge method={endpoint.method} />
                  <code className="font-mono text-[13px] text-foreground">
                    {endpoint.path}
                  </code>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-[3px] border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                    {t.baseUrl} https://capi.minapp.xin
                  </span>
                  <span className="rounded-[3px] border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                    {t.apiVersion} v1
                  </span>
                  <span className="rounded-[3px] border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                    {t.authentication} Bearer YOUR_API_TOKEN
                  </span>
                </div>
              </div>

              {endpoint.params.length > 0 ? (
                <div>
                  <SectionNumber n="02" title={t.parameters} />
                  <div className="mt-5 overflow-hidden rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead>{t.name}</TableHead>
                          <TableHead>{t.type}</TableHead>
                          <TableHead>{t.description}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {endpoint.params.map((param) => (
                          <TableRow key={param.name}>
                            <TableCell className="font-mono text-[12px] whitespace-normal text-foreground">
                              {param.name}
                              {param.required ? (
                                <span className="ml-1 text-destructive">*</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="font-mono text-[12px] text-muted-foreground">
                              {param.type}
                            </TableCell>
                            <TableCell className="text-[13px] whitespace-normal text-muted-foreground">
                              {param.description}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}

              {endpoint.requestBody ? (
                <div>
                  <SectionNumber
                    n={endpoint.params.length > 0 ? "03" : "02"}
                    title={t.requestBody}
                  />
                  <CodeBlock
                    className="mt-5"
                    label="JSON"
                    tabs={[
                      {
                        label: "JSON",
                        language: "json",
                        code: endpoint.requestBody,
                      },
                    ]}
                  />
                </div>
              ) : null}

              {endpoint.notes && endpoint.notes.length > 0 ? (
                <div>
                  <SectionNumber n="04" title={t.notes} />
                  <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-[14px] text-muted-foreground marker:text-neutral-300">
                    {endpoint.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-4 xl:sticky xl:top-[6.5rem]">
              <CodeBlock
                title={t.example}
                subtitle={endpoint.title}
                tabs={endpoint.example}
              />
              <CodeResponse
                status={endpoint.responseStatus.code}
                statusText={endpoint.responseStatus.text}
                code={endpoint.responseBody}
              />
            </div>
          </div>

          <div className="mt-16 flex flex-wrap gap-4 border-t border-border pt-8">
            {endpoint.group === "Task API" ? (
              <Link
                href={`${localePrefix}/docs/guides/task-api/quickstart`}
                className="text-[13px] font-medium text-brand underline-offset-4 hover:underline"
              >
                {t.taskApiQuickstart} →
              </Link>
            ) : null}
            <Link
              href={`${localePrefix}/docs/api`}
              className="text-[13px] font-medium text-brand underline-offset-4 hover:underline"
            >
              {overviewT.allEndpoints} →
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}

export const dynamic = "force-static";
