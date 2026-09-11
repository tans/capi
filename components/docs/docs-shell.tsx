import * as React from "react";
import { ChevronDown } from "lucide-react";

import { DocsSidebar } from "@/components/docs/docs-sidebar";

/**
 * Shared three-column shell for every documentation page:
 * sidebar · body · on-this-page.
 */
export function DocsShell({
  toc,
  children,
}: {
  toc?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="container-docs">
      <div className="grid gap-10 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_190px]">
        <aside className="hidden lg:block">
          <div className="sticky top-[6.5rem] max-h-[calc(100vh-8rem)] overflow-y-auto py-8 pr-2">
            <DocsSidebar />
          </div>
        </aside>

        <main className="min-w-0 py-8 lg:py-10">
          {/* Mobile navigation — the sidebar is hidden below lg. */}
          <details className="mb-8 rounded-md border border-border lg:hidden">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13px] font-medium">
              Documentation menu
              <ChevronDown className="size-4 text-muted-foreground" />
            </summary>
            <div className="border-t border-border px-4 py-4">
              <DocsSidebar />
            </div>
          </details>

          {children}
        </main>

        <aside className="hidden xl:block">
          <div className="sticky top-[6.5rem] max-h-[calc(100vh-8rem)] overflow-y-auto py-10">
            {toc}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Breadcrumb trail shown above every docs page title. */
export function DocsBreadcrumb({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
      {items.map((item, i) => (
        <React.Fragment key={`${item.label}-${i}`}>
          {i > 0 ? <span className="text-neutral-300">/</span> : null}
          {item.href ? (
            <a
              href={item.href}
              className="transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
