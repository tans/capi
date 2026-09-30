"use client";

import * as React from "react";
import { Check, Copy, FileText } from "lucide-react";
import { useLocale } from "@/components/locale-context";

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
  const [failed, setFailed] = React.useState(false);
  const locale = useLocale();

  const copy = React.useCallback(async () => {
    try {
      setFailed(false);
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setFailed(true);
    }
  }, [markdown]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        aria-live="polite"
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
      {failed && <span role="alert" className="text-xs text-error">{locale === "zh" ? "复制失败，请查看 Markdown 后手动复制。" : "Copy failed. Open Markdown and copy the text manually."}</span>}
    </div>
  );
}
