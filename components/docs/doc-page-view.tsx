import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { CopyPageActions } from "@/components/docs/copy-page";
import { DocsBreadcrumb, DocsShell } from "@/components/docs/docs-shell";
import { DocsToc } from "@/components/docs/docs-toc";
import type { DocsSidebar } from "@/components/docs/docs-sidebar";
import { DocBody } from "@/components/docs/markdown";
import { extractHeadings, type DocPage } from "@/lib/docs";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

export type Crumb = { label: string; href?: string };
export type NavLink = { title: string; slug: string };

type UiDict = Pick<
  Dictionary["common"],
  "previous" | "next" | "copyPage" | "viewMarkdown"
> & {
  onThisPage: string;
  menuLabel: string;
};

function PrevNext({
  prev,
  next,
  ui,
  localePrefix = "",
}: {
  prev?: NavLink;
  next?: NavLink;
  ui: UiDict;
  localePrefix?: string;
}) {
  if (!prev && !next) return null;

  return (
    <div className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link
          href={`${localePrefix}/docs/${prev.slug}`}
          className="group flex flex-col gap-1 rounded-md border border-border px-4 py-3 transition-colors hover:border-neutral-300"
        >
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            <ArrowLeft className="size-3" />
            {ui.previous}
          </span>
          <span className="text-[13px] font-medium text-foreground">
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={`${localePrefix}/docs/${next.slug}`}
          className="group flex flex-col items-end gap-1 rounded-md border border-border px-4 py-3 text-right transition-colors hover:border-neutral-300 sm:col-start-2"
        >
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {ui.next}
            <ArrowRight className="size-3" />
          </span>
          <span className="text-[13px] font-medium text-foreground">
            {next.title}
          </span>
        </Link>
      ) : null}
    </div>
  );
}

/** Shared renderer for a single documentation page. */
export function DocPageView({
  doc,
  slug,
  breadcrumb,
  prev,
  next,
  ui,
  locale = "en",
  localePrefix = "",
  sidebarLabels,
  contentNotice,
}: {
  doc: DocPage;
  slug: string;
  breadcrumb: Crumb[];
  prev?: NavLink;
  next?: NavLink;
  ui: UiDict;
  locale?: Locale;
  localePrefix?: string;
  sidebarLabels?: React.ComponentProps<typeof DocsSidebar>["labels"];
  /** Shown above the body when the prose has not been translated yet. */
  contentNotice?: string;
}) {
  const headings = extractHeadings(doc.body);
  const readingTime =
    locale === "zh"
      ? doc.readingTime.replace(/min read/i, "分钟阅读")
      : doc.readingTime;

  return (
    <DocsShell
      toc={<DocsToc headings={headings} label={ui.onThisPage} />}
      menuLabel={ui.menuLabel}
      localePrefix={localePrefix}
      sidebarLabels={sidebarLabels}
    >
      <DocsBreadcrumb items={breadcrumb} />

      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="display-1 text-foreground">{doc.title}</h1>
          {doc.description ? (
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              {doc.description}
            </p>
          ) : null}
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            {readingTime}
          </p>
        </div>
        <CopyPageActions
          slug={slug}
          markdown={doc.body}
          copyLabel={ui.copyPage}
          viewLabel={ui.viewMarkdown}
          localePrefix={localePrefix}
        />
      </div>

      <div className="mt-10">
        {contentNotice ? (
          <p className="mb-8 rounded-md border border-border bg-muted/40 px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
            {contentNotice}
          </p>
        ) : null}
        <DocBody body={doc.body} />
      </div>

      <PrevNext prev={prev} next={next} ui={ui} localePrefix={localePrefix} />
    </DocsShell>
  );
}
