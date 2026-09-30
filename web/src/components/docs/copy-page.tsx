"use client";

import * as React from "react";
import { Check, Copy, FileText } from "lucide-react";

export function CopyPageActions({
  slug,
  markdown,
  copyLabel = "Copy page",
  copiedLabel = "Copied",
  viewLabel = "View Markdown",
  localePrefix = "",
}: {
  slug: string;
  markdown: string;
  copyLabel?: string;
  copiedLabel?: string;
  viewLabel?: string;
  localePrefix?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }, [markdown]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-neutral-300 hover:text-foreground"
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-600" />
        ) : (
          <Copy className="size-3.5" />
        )}
        {copied ? copiedLabel : copyLabel}
      </button>
      <a
        href={`${localePrefix}/docs-md/${slug}`}
        target="_blank"
        rel="noreferrer"
        className="hidden items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground sm:flex"
      >
        <FileText className="size-3.5" />
        {viewLabel}
      </a>
    </div>
  );
}
