"use client";

import * as React from "react";
import { Plus, Search, Server, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDictionary, interpolate } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { ChannelType, EvaluateProtocol } from "@/lib/relay/types";
import { cn } from "@/lib/utils";

/** Upstream presets used by the channel provider picker. */
export const PROVIDERS: { id: string; label: string; type: ChannelType; baseUrl: string; evaluateProtocol?: EvaluateProtocol; evaluatePath?: string; models?: string[]; modelMapping?: Record<string, string> }[] = [
  { id: "openai", label: "OpenAI", type: "openai", baseUrl: "https://api.openai.com/v1" },
  { id: "deepseek", label: "DeepSeek", type: "openai-compatible", baseUrl: "https://api.deepseek.com/v1" },
  { id: "dashscope", label: "阿里云百炼", type: "openai-compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "moonshot", label: "月之暗面 Kimi", type: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1" },
  { id: "zhipu", label: "智谱 GLM", type: "openai-compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { id: "siliconflow", label: "硅基流动", type: "openai-compatible", baseUrl: "https://api.siliconflow.cn/v1" },
  { id: "ark", label: "火山方舟", type: "openai-compatible", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
  { id: "openrouter", label: "OpenRouter", type: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "groq", label: "Groq", type: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "xai", label: "xAI", type: "openai-compatible", baseUrl: "https://api.x.ai/v1" },
  { id: "vercel", label: "Vercel AI Gateway", type: "openai-compatible", baseUrl: "https://ai-gateway.vercel.sh/v1", models: ["inclusionai/ling-3.0-flash-sante"] },
  { id: "vercel-typesafe", label: "Vercel AI Gateway · TypeSafe", type: "openai-compatible", baseUrl: "https://ai-gateway.vercel.sh/typesafe/v1", evaluateProtocol: "typesafe", evaluatePath: "/systemone", models: ["typesafe-ai/jev"] },
  { id: "typesafe", label: "TypeSafe AI · Jev", type: "openai-compatible", baseUrl: "https://api.typesafe.ai/v1", evaluateProtocol: "typesafe", evaluatePath: "/systemone", models: ["typesafe-ai/jev"], modelMapping: { "typesafe-ai/jev": "jev-latest" } },
];

export type ChannelEditorDictionary = Dictionary["dashboard"]["components"]["channelEditor"];

export type Indicator = "idle" | "incomplete" | "configured" | "error";

export function Chip({ children, onRemove, label }: { children: React.ReactNode; onRemove: () => void; label: string }) {
  return (
    <span className="badge badge-outline gap-1 py-2 font-mono text-[11px] normal-case">
      {children}
      <button type="button" className="opacity-60 transition-opacity hover:opacity-100" onClick={onRemove} aria-label={label}>
        <X className="size-3" />
      </button>
    </span>
  );
}

/** One labelled control with an optional hint line under it. */
export function Field({
  htmlFor,
  title,
  hint,
  children,
  className,
}: {
  htmlFor?: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label className="text-[13px] font-medium text-foreground" htmlFor={htmlFor}>{title}</label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Section({ title, description, children, className }: { title: string; description: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-md border border-border bg-card p-5", className)}>
      <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

const INDICATOR_CLASS: Record<Indicator, string> = {
  idle: "bg-base-content/15",
  incomplete: "bg-warning",
  configured: "bg-info",
  error: "bg-error",
};

export function StatusDot({ state, label }: { state: Indicator; label: string }) {
  if (state === "idle") return null;
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground" title={label}>
      <span className={cn("inline-block size-1.5 rounded-full", INDICATOR_CLASS[state])} />
    </span>
  );
}

/** Searchable provider grid — the first step of creating a channel. */
export function ProviderPicker({
  locale,
  query,
  onQueryChange,
  onSelect,
  selectedId,
}: {
  locale: Locale;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (provider: (typeof PROVIDERS)[number] | null) => void;
  selectedId?: string;
}) {
  const d: ChannelEditorDictionary = getDictionary(locale).dashboard.components.channelEditor;
  const needle = query.trim().toLowerCase();
  const matches = PROVIDERS.filter((provider) => !needle || provider.label.toLowerCase().includes(needle) || provider.baseUrl.includes(needle));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{d.providerTitle}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{d.providerDescription}</p>
      </div>
      <label className="input input-sm flex w-full items-center gap-2">
        <Search className="size-3.5 opacity-60" />
        <input
          className="grow bg-transparent text-sm outline-none"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={d.providerSearch}
          aria-label={d.providerSearch}
          autoFocus
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {matches.map((provider) => (
          <button
            type="button"
            key={provider.id}
            onClick={() => onSelect(provider)}
            aria-pressed={selectedId === provider.id}
            className={cn(
              "flex flex-col gap-1 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-brand/50 hover:bg-brand-muted/40",
              selectedId === provider.id && "border-brand bg-brand-muted/60",
            )}
          >
            <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <Server className="size-3.5 text-muted-foreground" />
              {provider.label}
              {provider.type === "openai" && <span className="badge badge-xs badge-outline">{d.providerNative}</span>}
            </span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">{provider.baseUrl}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selectedId === "custom"}
          className={cn(
            "flex flex-col gap-1 rounded-md border border-dashed border-border bg-card p-3 text-left transition-colors hover:border-brand/50 hover:bg-brand-muted/40",
            selectedId === "custom" && "border-brand bg-brand-muted/60",
          )}
        >
          <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <Plus className="size-3.5 text-muted-foreground" />
            {d.providerCustom}
          </span>
          <span className="text-[11px] text-muted-foreground">{d.providerCustomHint}</span>
        </button>
      </div>
      {!matches.length && <p className="py-6 text-center text-sm text-muted-foreground">{d.providerEmpty}</p>}
    </div>
  );
}

/** Fetched-model picker: the list is never applied automatically. */
export function FetchedModels({
  locale,
  models,
  all,
  query,
  onQueryChange,
  onToggle,
  onSelectAll,
  onClear,
  onApply,
  onDismiss,
}: {
  locale: Locale;
  models: string[];
  all: string[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (model: string) => void;
  onSelectAll: (value: boolean) => void;
  onClear: () => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const d: ChannelEditorDictionary = getDictionary(locale).dashboard.components.channelEditor;
  const needle = query.trim().toLowerCase();
  const visible = all.filter((model) => !needle || model.toLowerCase().includes(needle));
  const added = all.filter((model) => models.includes(model)).length;
  return (
    <div className="rounded-md border border-brand/40 bg-brand-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-foreground">
          {interpolate(d.fetchedCounts, { total: String(all.length), added: String(added) })}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onSelectAll(visible.length !== visible.filter((model) => models.includes(model)).length)}>{d.fetchedSelectAll}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>{d.fetchedClear}</Button>
        </div>
      </div>
      <label className="input input-xs mt-3 flex w-full items-center gap-2">
        <Search className="size-3 opacity-60" />
        <input className="grow bg-transparent outline-none" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={d.fetchedSearch} aria-label={d.fetchedSearch} />
      </label>
      <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
        {visible.map((model) => {
          const existing = models.includes(model);
          return (
            <li key={model}>
              <label className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-[13px] hover:bg-card">
                <input type="checkbox" className="checkbox checkbox-xs" checked={existing} onChange={() => onToggle(model)} />
                <span className="truncate font-mono text-[12px]">{model}</span>
                <span className="ml-auto badge badge-xs badge-outline">{existing ? d.fetchedExisting : d.fetchedNew}</span>
              </label>
            </li>
          );
        })}
        {!visible.length && <li className="py-4 text-center text-xs text-muted-foreground">{d.fetchedEmpty}</li>}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" size="sm" variant="brand" onClick={onApply}>{d.fetchedApply}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>{d.cancel}</Button>
      </div>
    </div>
  );
}
