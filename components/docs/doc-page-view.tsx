import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { CopyPageActions } from "@/components/docs/copy-page";
import { DocsBreadcrumb, DocsShell } from "@/components/docs/docs-shell";
import { DocsToc } from "@/components/docs/docs-toc";
import { DocBody } from "@/components/docs/markdown";
import { extractHeadings, type DocPage } from "@/lib/docs";

export type Crumb = { label: string; href?: string };
export type NavLink = { title: string; slug: string };

function PrevNext({ prev, next }: { prev?: NavLink; next?: NavLink }) {
  if (!prev && !next) return null;

  return (
    <div className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link
          href={`/docs/${prev.slug}`}
          className="group flex flex-col gap-1 rounded-md border border-border px-4 py-3 transition-colors hover:border-neutral-300"
        >
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            <ArrowLeft className="size-3" />
            Previous
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
          href={`/docs/${next.slug}`}
          className="group flex flex-col items-end gap-1 rounded-md border border-border px-4 py-3 text-right transition-colors hover:border-neutral-300 sm:col-start-2"
        >
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            Next
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
}: {
  doc: DocPage;
  slug: string;
  breadcrumb: Crumb[];
  prev?: NavLink;
  next?: NavLink;
}) {
  const headings = extractHeadings(doc.body);

  return (
    <DocsShell toc={<DocsToc headings={headings} />}>
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
            {doc.readingTime}
          </p>
        </div>
        <CopyPageActions slug={slug} markdown={doc.body} />
      </div>

      <div className="mt-10">
        <DocBody body={doc.body} />
      </div>

      <PrevNext prev={prev} next={next} />
    </DocsShell>
  );
}
