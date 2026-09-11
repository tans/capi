"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function DocsToc({
  headings,
  className,
}: {
  headings: { id: string; text: string; level: number }[];
  className?: string;
}) {
  const [active, setActive] = React.useState<string | undefined>(
    headings[0]?.id,
  );

  React.useEffect(() => {
    if (headings.length === 0) return;

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Choose the topmost heading currently intersecting the viewport.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );

        if (visible[0]?.target.id) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: [0, 1] },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav className={cn("flex flex-col gap-2", className)}>
      <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        On this page
      </p>
      <ul className="flex flex-col gap-0.5 border-l border-border">
        {headings.map((heading) => {
          const isActive = active === heading.id;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                onClick={() => setActive(heading.id)}
                className={cn(
                  "-ml-px block border-l py-1 text-[12.5px] leading-snug transition-colors",
                  heading.level === 3 ? "pl-6" : "pl-3.5",
                  isActive
                    ? "border-brand font-medium text-brand"
                    : "border-transparent text-muted-foreground hover:border-neutral-300 hover:text-foreground",
                )}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
