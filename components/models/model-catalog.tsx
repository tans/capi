"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { ModelCard } from "@/components/models/model-card";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import {
  modelFilterTabs,
  models,
  providers,
  type Modality,
} from "@/lib/models-data";
import { cn } from "@/lib/utils";

type SortKey = "recommended" | "name" | "price";

/** Parse the leading number out of a price amount for sorting. */
function priceValue(amount: string) {
  const n = Number.parseFloat(amount);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/** Filter tab key -> dictionary key inside `models.filters`. */
const filterLabelKey = {
  all: "all",
  text: "llm",
  image: "image",
  video: "video",
  audio: "audio",
  utility: "utility",
} as const;

export function ModelCatalog({
  locale,
  initialModality = "all",
}: {
  locale: Locale;
  initialModality?: string;
}) {
  const dict = getDictionary(locale);
  const t = dict.models;

  const sortLabels: Record<SortKey, string> = {
    recommended: t.filters.sortRecommended,
    name: t.filters.sortName,
    price: t.filters.sortPrice,
  };

  const [query, setQuery] = React.useState("");
  const [modality, setModality] = React.useState(initialModality);
  const [provider, setProvider] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<SortKey>("recommended");
  const [sortOpen, setSortOpen] = React.useState(false);

  const matchesModality = React.useCallback((m: Modality, key: string) => {
    if (key === "all") return true;
    if (key === "audio") return m === "audio" || m === "music";
    return m === key;
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();

    const result = models.filter((model) => {
      if (!matchesModality(model.modality, modality)) return false;
      if (provider && model.provider !== provider) return false;
      if (!q) return true;

      return (
        model.name.toLowerCase().includes(q) ||
        model.provider.toLowerCase().includes(q) ||
        model.tagline.toLowerCase().includes(q) ||
        model.variants.some((v) => v.id.toLowerCase().includes(q))
      );
    });

    if (sort === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "price") {
      result.sort(
        (a, b) =>
          priceValue(a.priceFrom.amount) - priceValue(b.priceFrom.amount),
      );
    } else {
      result.sort((a, b) => {
        if (Boolean(b.featured) !== Boolean(a.featured)) {
          return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
        }
        return a.name.localeCompare(b.name);
      });
    }

    return result;
  }, [matchesModality, modality, provider, query, sort]);

  const activeFilters = modality !== "all" || provider !== null || query !== "";

  return (
    <div className="bg-ink">
      {/* Filter bar */}
      <div className="container-page py-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={dict.common.searchModels}
                aria-label={dict.common.search}
                className="w-full rounded-sm border border-ink-border bg-ink-soft py-2 pr-3 pl-9 text-[13px] text-white placeholder:text-ink-muted focus:border-neutral-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-ink-muted">
                {filtered.length} {dict.common.modelsCount}
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSortOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-sm border border-ink-border bg-ink-soft px-3 py-2 text-[12px] text-white"
                >
                  {sortLabels[sort]}
                  <span className="text-ink-muted">▾</span>
                </button>
                {sortOpen ? (
                  <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-sm border border-ink-border bg-ink-soft py-1 shadow-lg">
                    {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setSort(key);
                          setSortOpen(false);
                        }}
                        className={cn(
                          "block w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-white/5",
                          key === sort ? "text-white" : "text-ink-muted",
                        )}
                      >
                        {sortLabels[key]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {modelFilterTabs.map((tab) => {
              const active = modality === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setModality(tab.key)}
                  className={cn(
                    "rounded-[3px] border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors",
                    active
                      ? "border-transparent bg-white text-ink"
                      : "border-ink-border text-ink-muted hover:text-white",
                  )}
                >
                  {
                    t.filters[
                      filterLabelKey[tab.key as keyof typeof filterLabelKey] ??
                        "all"
                    ]
                  }
                  <span className="ml-1.5 opacity-60">({tab.count})</span>
                </button>
              );
            })}

            {activeFilters ? (
              <button
                type="button"
                onClick={() => {
                  setModality("all");
                  setProvider(null);
                  setQuery("");
                }}
                className="ml-1 flex items-center gap-1 rounded-[3px] px-2 py-1.5 font-mono text-[11px] tracking-wider text-ink-muted hover:text-white"
              >
                <X className="size-3" />
                {dict.common.reset}
              </button>
            ) : null}
          </div>

          <div id="providers" className="flex flex-col gap-2.5">
            <span className="font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">
              {t.filters.provider}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {providers.map((name) => {
                const active = provider === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setProvider(active ? null : name)}
                    className={cn(
                      "rounded-[3px] border px-2.5 py-1 text-[11px] transition-colors",
                      active
                        ? "border-transparent bg-white text-ink"
                        : "border-ink-border text-ink-muted hover:text-white",
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-background">
        <div className="container-page py-10">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <p className="text-[15px] font-medium text-foreground">
                {t.empty.title}
              </p>
              <p className="text-[13px] text-muted-foreground">{t.empty.body}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((model) => (
                <ModelCard key={model.slug} model={model} locale={locale} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
