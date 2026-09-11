"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { useLocale } from "@/components/locale-context";
import { highlight } from "@/lib/highlight";
import { cn } from "@/lib/utils";

export type CodeTab = {
  label: string;
  language: string;
  code: string;
};

const CODE_LABELS = {
  en: { copy: "Copy code", copied: "Copied", language: "Code language" },
  zh: { copy: "复制代码", copied: "已复制", language: "代码语言" },
} as const;

/* -------------------------------------------------------------------------- */

export function CopyButton({
  value,
  className,
  compact = false,
}: {
  value: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const t = CODE_LABELS[useLocale()];

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? t.copied : t.copy}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border border-ink-border bg-transparent px-2 py-1 font-mono text-[10px] tracking-wider text-ink-muted uppercase transition-colors hover:border-neutral-600 hover:text-ink-foreground",
        className,
      )}
    >
      {copied ? (
        <Check className="size-3 text-emerald-400" />
      ) : (
        <Copy className="size-3" />
      )}
      {compact ? null : <span>{copied ? t.copied : t.copy}</span>}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

function CodeText({
  code,
  language,
  className,
}: {
  code: string;
  language: string;
  className?: string;
}) {
  const html = React.useMemo(() => highlight(code, language), [code, language]);

  return (
    <pre
      className={cn(
        "overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.75] text-ink-foreground sm:px-5",
        className,
      )}
    >
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Dark editor surface with language tabs, an optional heading row, and a copy
 * button — visually matched to the reference site's code panels.
 */
export function CodeBlock({
  tabs,
  label,
  title,
  subtitle,
  className,
  bodyClassName,
}: {
  tabs: CodeTab[];
  /** Static left-hand caption used when there is only one snippet. */
  label?: string;
  /** Heading rendered above the tab row, e.g. "EXAMPLE". */
  title?: string;
  subtitle?: string;
  className?: string;
  bodyClassName?: string;
}) {
  const [active, setActive] = React.useState(0);
  const current = tabs[active] ?? tabs[0];
  const t = CODE_LABELS[useLocale()];

  if (!current) return null;

  return (
    <div
      className={cn(
        "code-panel overflow-hidden rounded-md border border-ink-border bg-ink",
        className,
      )}
    >
      {title ? (
        <div className="border-b border-ink-border px-4 py-3 sm:px-5">
          <p className="font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-1 text-sm font-medium text-ink-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
        {tabs.length > 1 ? (
          <div
            role="tablist"
            aria-label={t.language}
            className="flex items-center gap-0.5 overflow-x-auto"
          >
            {tabs.map((tab, i) => (
              <button
                key={tab.label}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={cn(
                  "rounded-[3px] px-2.5 py-1 font-mono text-[11px] whitespace-nowrap transition-colors",
                  i === active
                    ? "bg-white/10 text-white"
                    : "text-ink-muted hover:text-ink-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="px-1 font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">
            {label ?? current.label}
          </span>
        )}

        <CopyButton value={current.code} />
      </div>

      <CodeText
        code={current.code}
        language={current.language}
        className={bodyClassName}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Secondary dark panel rendered beneath request snippets for the response
 * payload, e.g. `HTTP 200 · OK`.
 */
export function CodeResponse({
  status,
  statusText,
  code,
  language = "json",
  className,
}: {
  status: string;
  statusText: string;
  code: string;
  language?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "code-panel overflow-hidden rounded-md border border-ink-border bg-ink",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-ink-border px-4 py-2.5 sm:px-5">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <span className="font-mono text-[11px] text-ink-foreground">
          HTTP {status}
        </span>
        <span className="font-mono text-[11px] text-ink-muted">
          · {statusText}
        </span>
      </div>
      <CodeText code={code} language={language} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Inline code chip that matches the docs body style. */
export function Code({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <code
      className={cn(
        "rounded-[4px] border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.8125em] text-foreground",
        className,
      )}
    >
      {children}
    </code>
  );
}

/** Single-line shell command strip with a leading prompt and copy affordance. */
export function CommandStrip({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "code-panel inline-flex max-w-full items-center gap-3 rounded-md border border-ink-border bg-ink py-2.5 pr-2.5 pl-4",
        className,
      )}
    >
      <span className="font-mono text-xs text-ink-muted select-none">$</span>
      <span className="truncate font-mono text-[12.5px] text-ink-foreground">
        {command}
      </span>
      <CopyButton value={command} compact className="ml-auto" />
    </div>
  );
}
