"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";

import { apiNav } from "@/lib/api-spec";
import { guidesNav, resourcesNav, type NavSection } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";

type FlatLink = { title: string; slug: string; breadcrumb: string };

function flatten(sections: NavSection[]): FlatLink[] {
  return sections.flatMap((section) =>
    section.items.map((item) => ({
      title: item.title,
      slug: item.slug,
      breadcrumb: section.title,
    })),
  );
}

function SearchBox({
  query,
  onChange,
  placeholder,
}: {
  query: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-sm border border-input bg-transparent py-1.5 pr-12 pl-8 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/60"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-[3px] border border-border px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
        ⌘K
      </kbd>
    </div>
  );
}

function SectionGroup({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 py-2 text-left text-[13px] font-semibold tracking-tight text-foreground"
      >
        {title}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open ? "" : "-rotate-90",
          )}
        />
      </button>
      {open ? <div className="flex flex-col gap-0.5 pb-3">{children}</div> : null}
    </div>
  );
}

function NavItemLink({
  href,
  active,
  children,
  depth = 0,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  depth?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-sm py-1.5 pr-2 text-[13px] transition-colors",
        depth === 0 ? "pl-2" : "pl-4",
        active
          ? "bg-brand-muted font-medium text-brand"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

type Labels = {
  search: string;
  /** Template containing `{query}` — substituted on the client. */
  noResults: string;
  groups: { guides: string; api: string; resources: string };
};

const fallbackLabels: Labels = {
  search: "Search",
  noResults: "No pages match “{query}”.",
  groups: { guides: "Guides", api: "API Reference", resources: "Resources" },
};

export function DocsSidebar({
  className,
  localePrefix = "",
  labels = fallbackLabels,
}: {
  className?: string;
  localePrefix?: string;
  labels?: Labels;
}) {
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");

  const slug = pathname.replace(new RegExp(`^${localePrefix}/docs/`), "");
  const inApi = pathname.startsWith(`${localePrefix}/docs/api`);
  const inResources = pathname.startsWith(`${localePrefix}/docs/resources`);

  const searchable = React.useMemo(
    () => [
      ...flatten(guidesNav),
      ...flatten(resourcesNav),
      ...apiNav.flatMap((group) =>
        group.providers.flatMap((provider) =>
          provider.endpoints.map((endpoint) => ({
            title: endpoint.title,
            slug: `api/${endpoint.slug}`,
            breadcrumb: `${group.group} · ${provider.provider}`,
          })),
        ),
      ),
    ],
    [],
  );

  const results = query.trim()
    ? searchable
        .filter((item) =>
          `${item.title} ${item.breadcrumb} ${item.slug}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .slice(0, 24)
    : null;

  const href = (path: string) => `${localePrefix}/docs/${path}`;

  const tabs = [
    { href: `${localePrefix}/docs/guides`, label: labels.groups.guides },
    { href: `${localePrefix}/docs/api`, label: labels.groups.api },
    { href: `${localePrefix}/docs/resources`, label: labels.groups.resources },
  ];

  return (
    <nav className={cn("flex flex-col gap-4", className)}>
      <SearchBox query={query} onChange={setQuery} placeholder={labels.search} />

      {results ? (
        <div className="flex flex-col gap-0.5">
          {results.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-muted-foreground">
              {labels.noResults.replace("{query}", query)}
            </p>
          ) : (
            results.map((item) => (
              <Link
                key={item.slug}
                href={href(item.slug)}
                onClick={() => setQuery("")}
                className="rounded-sm px-2 py-1.5 transition-colors hover:bg-muted"
              >
                <span className="block text-[13px] text-foreground">
                  {item.title}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {item.breadcrumb}
                </span>
              </Link>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            {tabs.map((tab) => {
              const guidesActive = tab.href === `${localePrefix}/docs/guides`;
              const active = guidesActive
                ? pathname.startsWith(`${localePrefix}/docs/guides`) ||
                  pathname === `${localePrefix}/docs`
                : pathname.startsWith(tab.href);
              return (
                <NavItemLink key={tab.href} href={tab.href} active={active}>
                  {tab.label}
                </NavItemLink>
              );
            })}
          </div>

          <div className="flex flex-col border-t border-border pt-3">
            {inApi ? (
              <>
                {apiNav.map((group) => (
                  <SectionGroup key={group.group} title={group.group}>
                    {group.providers.map((provider) => {
                      const providerActive = provider.endpoints.some(
                        (e) => `api/${e.slug}` === slug,
                      );
                      return (
                        <SectionGroup
                          key={`${group.group}-${provider.provider}`}
                          title={provider.provider}
                          defaultOpen={providerActive}
                        >
                          {provider.endpoints.map((endpoint) => (
                            <NavItemLink
                              key={endpoint.slug}
                              href={href(`api/${endpoint.slug}`)}
                              active={`api/${endpoint.slug}` === slug}
                              depth={1}
                            >
                              {endpoint.title}
                            </NavItemLink>
                          ))}
                        </SectionGroup>
                      );
                    })}
                  </SectionGroup>
                ))}
              </>
            ) : inResources ? (
              <>
                {resourcesNav.map((section) => (
                  <SectionGroup key={section.title} title={section.title}>
                    {section.items.map((item) => (
                      <NavItemLink
                        key={item.slug}
                        href={href(item.slug)}
                        active={item.slug === slug}
                      >
                        {item.title}
                      </NavItemLink>
                    ))}
                  </SectionGroup>
                ))}
              </>
            ) : (
              <>
                {guidesNav.map((section) => (
                  <SectionGroup key={section.title} title={section.title}>
                    {section.items.map((item) => (
                      <NavItemLink
                        key={item.slug}
                        href={href(item.slug)}
                        active={item.slug === slug}
                      >
                        {item.title}
                      </NavItemLink>
                    ))}
                  </SectionGroup>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </nav>
  );
}
