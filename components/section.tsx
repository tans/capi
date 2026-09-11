import * as React from "react";

import { cn } from "@/lib/utils";

export function Section({
  className,
  children,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={cn("py-16 sm:py-20", className)}>
      <div className="container-page">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  action,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  action?: React.ReactNode;
}) {
  const centered = align === "center";

  return (
    <div
      className={cn(
        centered
          ? "flex flex-col items-center text-center"
          : "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className={cn(centered && "flex flex-col items-center")}>
        {eyebrow ? (
          eyebrow.match(/^[A-Z0-9 &]+$/) ? (
            <p className="eyebrow">{eyebrow}</p>
          ) : (
            <span className="eyebrow-solid">{eyebrow}</span>
          )
        ) : null}
        <h2
          className={cn(
            "display-2 text-foreground",
            eyebrow ? "mt-4" : undefined,
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            className={cn(
              "mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground",
              centered && "mx-auto",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Thin-bordered surface used for the bulk of the marketing cards. */
export function Surface({
  className,
  children,
  interactive = false,
}: {
  className?: string;
  children: React.ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-6",
        interactive && "transition-colors hover:border-neutral-300",
        className,
      )}
    >
      {children}
    </div>
  );
}
