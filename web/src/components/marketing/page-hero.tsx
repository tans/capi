import * as React from "react";
import Link from "next/link";

import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const isZh = (locale?: Locale) => locale === "zh";

export function PageHero({
  locale,
  eyebrow,
  title,
  description,
  primary,
  secondary,
  code,
  meta,
  className,
}: {
  locale?: Locale;
  eyebrow?: string;
  title: React.ReactNode;
  description: React.ReactNode;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  code?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border py-14", className)}>
      <div className="container-page grid items-start gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="pt-2">
          {eyebrow ? <span className="eyebrow-solid">{eyebrow}</span> : null}
          <h1 className="display-1 mt-5 text-foreground">{title}</h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>

          {primary || secondary ? (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {primary ? (
                <Button
                  asChild
                  variant="brand"
                  size="lg"
                  className={cn(isZh(locale) ? "" : "uppercase")}
                >
                  <Link href={primary.href}>{primary.label}</Link>
                </Button>
              ) : null}
              {secondary ? (
                <Link
                  href={secondary.href}
                  className={cn(
                    "font-mono text-[11px] tracking-wider text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
                    isZh(locale) ? "" : "uppercase",
                  )}
                >
                  {secondary.label}
                </Link>
              ) : null}
            </div>
          ) : null}

          {meta ? <div className="mt-7">{meta}</div> : null}
        </div>

        {code ? <div>{code}</div> : null}
      </div>
    </section>
  );
}

export function FeatureGrid({
  items,
  columns = 3,
  className,
}: {
  items: {
    title: string;
    body: string;
    meta?: string;
    href?: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const cols =
    columns === 2
      ? "sm:grid-cols-2"
      : columns === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={cn("grid gap-4", cols, className)}>
      {items.map((item) => {
        const inner = (
          <>
            {item.icon ? (
              <item.icon className="size-[18px] text-brand" />
            ) : null}
            <h3
              className={cn(
                "text-[15px] font-semibold tracking-tight text-foreground",
                item.icon ? "mt-4" : undefined,
              )}
            >
              {item.title}
            </h3>
            <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">
              {item.body}
            </p>
            {item.meta ? (
              <p className="mt-4 font-mono text-[11px] tracking-wider text-muted-foreground">
                {item.meta}
              </p>
            ) : null}
          </>
        );

        return item.href ? (
          <Link
            key={item.title}
            href={item.href}
            className="flex flex-col rounded-md border border-border bg-card p-6 transition-colors hover:border-neutral-300"
          >
            {inner}
          </Link>
        ) : (
          <div
            key={item.title}
            className="flex flex-col rounded-md border border-border bg-card p-6"
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function Steps({
  items,
  className,
}: {
  items: { title: string; body: string; code?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col divide-y divide-border", className)}>
      {items.map((item, i) => (
        <div key={item.title} className="grid gap-4 py-6 sm:grid-cols-[2rem_minmax(0,1fr)]">
          <span className="flex size-7 items-center justify-center rounded-[4px] bg-ink font-mono text-[11px] font-medium text-white">
            {i + 1}
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
              {item.title}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {item.body}
            </p>
            {item.code ? (
              <pre className="code-panel mt-4 overflow-x-auto rounded-md border border-ink-border bg-ink px-4 py-3 font-mono text-[12.5px] text-ink-foreground">
                <code>{item.code}</code>
              </pre>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ClosingCta({
  locale,
  title,
  description,
  primary,
  secondary,
}: {
  locale?: Locale;
  title: string;
  description: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  const t = getDictionary(locale).common;
  const primaryCta = primary ?? { label: t.getApiKey, href: "/signup" };
  const secondaryCta = secondary ?? { label: t.readTheDocs, href: "/docs" };

  return (
    <div className="section-rule">
      <div className="container-page py-20">
        <div className="flex flex-col items-center">
          <h2 className="display-2 text-center text-foreground">{title}</h2>
          <p className="mt-4 max-w-lg text-center text-[15px] text-muted-foreground">
            {description}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button
              asChild
              variant="brand"
              size="lg"
              className={cn(isZh(locale) ? "" : "uppercase")}
            >
              <Link href={primaryCta.href}>{primaryCta.label}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Section };
