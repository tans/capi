"use client";

import * as React from "react";
import { AlertTriangle, Plus, RefreshCw, Search, Server, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDictionary, interpolate } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { ChannelStatus, ChannelType, MultiKeyMode } from "@/lib/relay/types";
import type { ChannelDraft } from "@/lib/relay/channel-draft";
import { cn } from "@/lib/utils";

/** Normalized channel body accepted by `/api/workspaces/:wid/channels` and `/api/admin/channels`. */
export type ChannelSubmit = Omit<ChannelDraft, "id" | "keyCount" | "lastError" | "modelMapping" | "headers" | "paramOverride" | "tag" | "videoSubmitPath" | "videoStatusPath"> & {
  keys?: string[];
  modelMapping?: Record<string, string>;
  headers?: Record<string, string>;
  paramOverride?: Record<string, unknown>;
  tag?: string;
  videoSubmitPath?: string;
  videoStatusPath?: string;
};

export type ChannelDiscoveryRequest = {
  baseUrl: string;
  keys: string[];
  channelId?: number;
  headers?: Record<string, string>;
};

/**
 * Upstream presets. CAPI's relay speaks the OpenAI-compatible protocol for every
 * provider, so a preset only pins the protocol, the base URL, and a readable name.
 */
const PROVIDERS: { id: string; label: string; type: ChannelType; baseUrl: string }[] = [
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
];

type ChannelEditorDictionary = Dictionary["dashboard"]["components"]["channelEditor"];
type TabKey = "connection" | "routing" | "advanced";
type Indicator = "idle" | "incomplete" | "configured" | "error";

const splitList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

function parseJsonObject(text: string): { value?: Record<string, unknown>; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { value: undefined };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "object" };
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: "json" };
  }
}

function Chip({ children, onRemove, label }: { children: React.ReactNode; onRemove: () => void; label: string }) {
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
function Field({
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

function Section({ title, description, children, className }: { title: string; description: string; children: React.ReactNode; className?: string }) {
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

function StatusDot({ state, label }: { state: Indicator; label: string }) {
  if (state === "idle") return null;
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground" title={label}>
      <span className={cn("inline-block size-1.5 rounded-full", INDICATOR_CLASS[state])} />
    </span>
  );
}

/** Searchable provider grid — the first step of creating a channel. */
function ProviderPicker({
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
function FetchedModels({
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

/**
 * Channel add/edit panel. Mirrors the New-API channel drawer: a side sheet whose
 * first step picks an upstream provider and whose second step edits a grouped,
 * tabbed configuration whose first tab is a two-column grid.
 */
export function ChannelEditorPanel({
  open,
  onOpenChange,
  locale,
  initial,
  onSubmit,
  discover,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  /** `null` (or omitted) opens the panel in create mode. */
  initial?: ChannelDraft | null;
  onSubmit: (payload: ChannelSubmit) => Promise<void>;
  /** Absent when the surface cannot reach the discovery endpoint. */
  discover?: (input: ChannelDiscoveryRequest) => Promise<string[]>;
  /** Absent when the surface deletes channels elsewhere. */
  onDeleted?: () => Promise<void>;
}) {
  const d: ChannelEditorDictionary = getDictionary(locale).dashboard.components.channelEditor;
  const editing = Boolean(initial);

  const [stage, setStage] = React.useState<"provider" | "form">(editing ? "form" : "provider");
  const [providerQuery, setProviderQuery] = React.useState("");
  const [providerId, setProviderId] = React.useState<string>("openai");
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<ChannelType>("openai-compatible");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);
  const [keysText, setKeysText] = React.useState("");
  const [multiKeyMode, setMultiKeyMode] = React.useState<MultiKeyMode>("random");
  const [autoBan, setAutoBan] = React.useState(true);
  const [models, setModels] = React.useState<string[]>([]);
  const [modelInput, setModelInput] = React.useState("");
  const [groups, setGroups] = React.useState<string[]>(["default"]);
  const [groupInput, setGroupInput] = React.useState("");
  const [priority, setPriority] = React.useState(0);
  const [weight, setWeight] = React.useState(0);
  const [mapping, setMapping] = React.useState<{ from: string; to: string }[]>([]);
  const [headersText, setHeadersText] = React.useState("");
  const [paramText, setParamText] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [videoSubmitPath, setVideoSubmitPath] = React.useState("");
  const [videoStatusPath, setVideoStatusPath] = React.useState("");

  const [discovered, setDiscovered] = React.useState<string[] | null>(null);
  const [discovering, setDiscovering] = React.useState(false);
  const [discoverError, setDiscoverError] = React.useState("");
  const [fetchedQuery, setFetchedQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [tab, setTab] = React.useState<TabKey>("connection");

  // Hydrate whenever the panel opens for a different channel.
  React.useEffect(() => {
    if (!open) return;
    setStage(initial ? "form" : "provider");
    setProviderQuery("");
    setError("");
    setDiscovered(null);
    setDiscoverError("");
    setFetchedQuery("");
    setKeysText("");
    setModelInput("");
    setGroupInput("");
    if (!initial) {
      setProviderId("openai");
      setName("");
      setType("openai-compatible");
      setBaseUrl("");
      setEnabled(true);
      setMultiKeyMode("random");
      setAutoBan(true);
      setModels([]);
      setGroups(["default"]);
      setPriority(0);
      setWeight(0);
      setMapping([]);
      setHeadersText("");
      setParamText("");
      setTag("");
      setVideoSubmitPath("");
      setVideoStatusPath("");
      setTab("connection");
      return;
    }
    setName(initial.name);
    setType(initial.type);
    setBaseUrl(initial.baseUrl);
    setEnabled(initial.status === 1);
    setMultiKeyMode(initial.multiKeyMode);
    setAutoBan(initial.autoBan);
    setModels(initial.models);
    setGroups(initial.groups.length ? initial.groups : ["default"]);
    setPriority(initial.priority);
    setWeight(initial.weight);
    setMapping(Object.entries(initial.modelMapping).map(([from, to]) => ({ from, to })));
    setHeadersText(initial.headers && Object.keys(initial.headers).length ? JSON.stringify(initial.headers, null, 2) : "");
    setParamText(initial.paramOverride && Object.keys(initial.paramOverride).length ? JSON.stringify(initial.paramOverride, null, 2) : "");
    setTag(initial.tag);
    setVideoSubmitPath(initial.videoSubmitPath);
    setVideoStatusPath(initial.videoStatusPath);
    setProviderId(PROVIDERS.find((provider) => provider.baseUrl === initial.baseUrl)?.id ?? "custom");
    setTab("connection");
  }, [open, initial]);

  const headersJson = React.useMemo(() => parseJsonObject(headersText), [headersText]);
  const paramJson = React.useMemo(() => parseJsonObject(paramText), [paramText]);
  const duplicateSources = React.useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const row of mapping) {
      const from = row.from.trim();
      if (!from) continue;
      if (seen.has(from)) duplicates.add(from);
      seen.add(from);
    }
    return [...duplicates];
  }, [mapping]);

  const connectionReady = Boolean(name.trim() && /^https:\/\/.+/.test(baseUrl.trim()) && models.length && groups.length);
  const indicator = (key: TabKey): Indicator => {
    if (key === "connection") {
      if (connectionReady) return "configured";
      return "incomplete";
    }
    if (key === "routing") return mapping.length ? "configured" : "idle";
    if (headersJson.error || paramJson.error) return "error";
    return tag || headersText.trim() || paramText.trim() || videoSubmitPath || videoStatusPath ? "configured" : "idle";
  };
  const indicatorLabel = (state: Indicator, required: boolean) =>
    state === "error" ? d.stateError : state === "configured" ? d.stateConfigured : required ? d.stateIncomplete : d.stateConfigured;

  function chooseProvider(provider: (typeof PROVIDERS)[number] | null) {
    if (provider) {
      setProviderId(provider.id);
      setType(provider.type);
      setBaseUrl(provider.baseUrl);
      if (!name.trim()) setName(provider.label);
    } else {
      setProviderId("custom");
      setBaseUrl("");
    }
    setStage("form");
  }

  async function runDiscovery() {
    if (!discover) return;
    setDiscoverError("");
    const keys = splitList(keysText);
    if (!editing && !keys.length) {
      setDiscoverError(d.fetchModelsRequiresKey);
      return;
    }
    setDiscovering(true);
    try {
      const found = await discover({
        baseUrl: baseUrl.trim(),
        keys,
        channelId: initial?.id,
        headers: headersJson.value ? Object.fromEntries(Object.entries(headersJson.value).map(([key, value]) => [key, String(value)])) : undefined,
      });
      setDiscovered(found);
    } catch (cause) {
      setDiscovered(null);
      setDiscoverError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDiscovering(false);
    }
  }

  function addModel(value: string) {
    const candidates = splitList(value);
    if (!candidates.length) return;
    setModels((current) => [...current, ...candidates.filter((candidate) => !current.includes(candidate))]);
    setModelInput("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const url = baseUrl.trim();
    if (!name.trim()) return setError(d.requiredName);
    if (!/^https:\/\/.+/.test(url)) return setError(d.invalidBaseUrl);
    if (!models.length) return setError(d.requiredModels);
    if (!groups.length) return setError(d.requiredGroups);
    if (duplicateSources.length) return setError(interpolate(d.mappingDuplicate, { models: duplicateSources.join(", ") }));
    if (headersJson.error || paramJson.error) return setError(d.invalidJson);
    const keys = splitList(keysText);
    if (!editing && !keys.length) return setError(d.apiKeyRequired);
    const payload: ChannelSubmit = {
      name: name.trim(),
      type,
      baseUrl: url,
      models,
      groups,
      priority: Number.isFinite(priority) ? priority : 0,
      weight: Number.isFinite(weight) ? weight : 0,
      status: enabled ? 1 : 3,
      autoBan,
      multiKeyMode,
      ...(keys.length ? { keys } : {}),
      ...(mapping.filter((row) => row.from.trim()).length
        ? { modelMapping: Object.fromEntries(mapping.filter((row) => row.from.trim()).map((row) => [row.from.trim(), row.to.trim()])) }
        : {}),
      ...(headersJson.value ? { headers: Object.fromEntries(Object.entries(headersJson.value).map(([key, value]) => [key, String(value)])) } : {}),
      ...(paramJson.value ? { paramOverride: paramJson.value } : {}),
      ...(tag.trim() ? { tag: tag.trim() } : {}),
      ...(videoSubmitPath.trim() ? { videoSubmitPath: videoSubmitPath.trim() } : {}),
      ...(videoStatusPath.trim() ? { videoStatusPath: videoStatusPath.trim() } : {}),
    };
    setBusy(true);
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const provider = PROVIDERS.find((item) => item.id === providerId);
  const providerLabel = provider?.label ?? d.providerCustom;

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <SheetContent side="right" className="w-full max-w-3xl gap-0 p-0" aria-describedby={undefined}>
        <div className="flex items-start justify-between gap-3 border-b border-border py-4 pr-14 pl-6">
          <div className="min-w-0">
            <SheetTitle className="text-[17px] tracking-tight">{editing ? d.editTitle : d.addTitle}</SheetTitle>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {editing ? interpolate(d.editDescription, { provider: providerLabel }) : d.addDescription}
            </p>
          </div>
          {stage === "form" && (
            <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setStage("provider")}>
              <RefreshCw className="size-3.5" />
              {d.changeProvider}
            </Button>
          )}
        </div>

        {stage === "provider" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <ProviderPicker locale={locale} query={providerQuery} onQueryChange={setProviderQuery} onSelect={chooseProvider} selectedId={providerId} />
          </div>
        ) : (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
                <TabsList className="tabs tabs-border w-full justify-start gap-1">
                  <TabsTrigger className="tab" value="connection">
                    {d.tabConnection}
                    <StatusDot state={indicator("connection")} label={indicatorLabel(indicator("connection"), true)} />
                  </TabsTrigger>
                  <TabsTrigger className="tab" value="routing">
                    {d.tabRouting}
                    <StatusDot state={indicator("routing")} label={indicatorLabel(indicator("routing"), false)} />
                  </TabsTrigger>
                  <TabsTrigger className="tab" value="advanced">
                    {d.tabAdvanced}
                    <StatusDot state={indicator("advanced")} label={indicatorLabel(indicator("advanced"), false)} />
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="connection" className="mt-5">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="flex flex-col gap-4">
                      <Section title={d.sectionBasic} description={d.sectionBasicHint}>
                        <div className="flex items-center gap-2 rounded-sm border border-border bg-muted/40 px-3 py-2">
                          <Server className="size-4 shrink-0 text-muted-foreground" />
                          <span className="text-[13px] font-medium">{providerLabel}</span>
                          {type === "openai" && <span className="badge badge-xs badge-outline ml-auto">{d.providerNative}</span>}
                        </div>
                        <Field htmlFor="channel-name" title={d.name}>
                          <input id="channel-name" className="input input-sm w-full" value={name} onChange={(event) => setName(event.target.value)} placeholder={d.namePlaceholder} required autoFocus />
                        </Field>
                        <Field htmlFor="channel-protocol" title={d.protocol} hint={d.protocolHint}>
                          <select id="channel-protocol" className="select select-sm w-full" value={type} onChange={(event) => setType(event.target.value as ChannelType)}>
                            <option value="openai-compatible">{d.protocolCompatible}</option>
                            <option value="openai">{d.protocolOpenai}</option>
                          </select>
                        </Field>
                        <Field htmlFor="channel-base-url" title={d.baseUrl} hint={d.baseUrlHint}>
                          <input id="channel-base-url" className="input input-sm w-full font-mono text-[12px]" type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={d.baseUrlPlaceholder} required spellCheck={false} />
                        </Field>
                        <div className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium">{d.enabled}</p>
                            <p className="text-[11px] text-muted-foreground">{d.enabledHint}</p>
                          </div>
                          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={d.enabled} />
                        </div>
                        {initial?.status === 2 && (
                          <p role="status" className="alert alert-warning alert-soft items-start text-[12px]">
                            <AlertTriangle className="size-4 shrink-0" />
                            <span className="min-w-0 break-words">
                              {d.autoDisabled}
                              {initial.lastError ? ` · ${initial.lastError}` : ""}
                            </span>
                          </p>
                        )}
                      </Section>

                      <Section title={d.sectionCredentials} description={d.sectionCredentialsHint}>
                        <Field htmlFor="channel-keys" title={d.apiKey} hint={editing ? interpolate(d.apiKeyKeepHint, { count: String(initial?.keyCount ?? 0) }) : d.apiKeyHint}>
                          <textarea
                            id="channel-keys"
                            className="textarea textarea-sm w-full font-mono text-[12px]"
                            rows={4}
                            value={keysText}
                            onChange={(event) => setKeysText(event.target.value)}
                            placeholder={editing ? d.apiKeyKeepPlaceholder : d.apiKeyPlaceholder}
                            autoComplete="off"
                            spellCheck={false}
                            required={!editing}
                          />
                        </Field>
                        <Field htmlFor="channel-key-mode" title={d.multiKeyMode}>
                          <select id="channel-key-mode" className="select select-sm w-full" value={multiKeyMode} onChange={(event) => setMultiKeyMode(event.target.value as MultiKeyMode)}>
                            <option value="random">{d.multiKeyRandom}</option>
                            <option value="polling">{d.multiKeyPolling}</option>
                          </select>
                        </Field>
                        <div className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium">{d.autoBan}</p>
                            <p className="text-[11px] text-muted-foreground">{d.autoBanHint}</p>
                          </div>
                          <Switch checked={autoBan} onCheckedChange={setAutoBan} aria-label={d.autoBan} />
                        </div>
                      </Section>
                    </div>

                    <div className="flex flex-col gap-4">
                      <Section title={d.sectionModels} description={d.sectionModelsHint}>
                        <div className="flex flex-wrap gap-1.5">
                          {models.map((model) => (
                            <Chip key={model} label={d.modelsRemove} onRemove={() => setModels((current) => current.filter((item) => item !== model))}>{model}</Chip>
                          ))}
                          {!models.length && <p className="text-[12px] text-muted-foreground">{d.modelsEmpty}</p>}
                        </div>
                        <div className="join w-full">
                          <input
                            className="input input-sm join-item min-w-0 flex-1"
                            value={modelInput}
                            onChange={(event) => setModelInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addModel(modelInput);
                              }
                            }}
                            placeholder={d.modelsPlaceholder}
                            aria-label={d.models}
                          />
                          <Button type="button" size="sm" variant="outline" className="join-item" onClick={() => addModel(modelInput)}>
                            <Plus className="size-3.5" />
                            {d.modelsAdd}
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {discover && (
                            <Button type="button" size="sm" variant="outlineBrand" onClick={() => void runDiscovery()} disabled={discovering || !baseUrl.trim()}>
                              {discovering ? <span className="loading loading-spinner loading-xs" /> : <RefreshCw className="size-3.5" />}
                              {discovering ? d.fetchingModels : d.fetchModels}
                            </Button>
                          )}
                          {models.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setModels([])}>{d.modelsClear}</Button>}
                        </div>
                        {discoverError && <p role="alert" className="text-[12px] text-error">{discoverError}</p>}
                        {discovered && (
                          <FetchedModels
                            locale={locale}
                            models={models}
                            all={discovered}
                            query={fetchedQuery}
                            onQueryChange={setFetchedQuery}
                            onToggle={(model) => setModels((current) => current.includes(model) ? current.filter((item) => item !== model) : [...current, model])}
                            onSelectAll={(value) => {
                              const needle = fetchedQuery.trim().toLowerCase();
                              const scoped = discovered.filter((model) => !needle || model.toLowerCase().includes(needle));
                              setModels((current) => value
                                ? [...current, ...scoped.filter((model) => !current.includes(model))]
                                : current.filter((model) => !scoped.includes(model)));
                            }}
                            onClear={() => setModels((current) => current.filter((model) => !discovered.includes(model)))}
                            onApply={() => { setDiscovered(null); setFetchedQuery(""); }}
                            onDismiss={() => { setDiscovered(null); setFetchedQuery(""); }}
                          />
                        )}
                      </Section>

                      <Section title={d.sectionGroups} description={d.sectionGroupsHint}>
                        <div className="flex flex-wrap gap-1.5">
                          {groups.map((group) => (
                            <Chip key={group} label={d.groupsRemove} onRemove={() => setGroups((current) => current.filter((item) => item !== group))}>{group}</Chip>
                          ))}
                          {!groups.length && <p className="text-[12px] text-muted-foreground">{d.groupsEmpty}</p>}
                        </div>
                        <div className="join w-full">
                          <input
                            className="input input-sm join-item min-w-0 flex-1"
                            value={groupInput}
                            onChange={(event) => setGroupInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                const values = splitList(groupInput).filter((value) => !groups.includes(value));
                                if (values.length) setGroups((current) => [...current, ...values]);
                                setGroupInput("");
                              }
                            }}
                            placeholder={d.groupsPlaceholder}
                            aria-label={d.groups}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="join-item"
                            onClick={() => {
                              const values = splitList(groupInput).filter((value) => !groups.includes(value));
                              if (values.length) setGroups((current) => [...current, ...values]);
                              setGroupInput("");
                            }}
                          >
                            <Plus className="size-3.5" />
                            {d.groupsAdd}
                          </Button>
                        </div>
                      </Section>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="routing" className="mt-5">
                  <div className="flex flex-col gap-4">
                    <Section title={d.sectionRouting} description={d.sectionRoutingHint}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field htmlFor="channel-priority" title={d.priority} hint={d.priorityHint}>
                          <input id="channel-priority" className="input input-sm w-full" type="number" step={1} value={priority} onChange={(event) => setPriority(Number(event.target.value))} />
                        </Field>
                        <Field htmlFor="channel-weight" title={d.weight} hint={d.weightHint}>
                          <input id="channel-weight" className="input input-sm w-full" type="number" min={0} step={1} value={weight} onChange={(event) => setWeight(Number(event.target.value))} />
                        </Field>
                      </div>
                    </Section>

                    <Section title={d.sectionMapping} description={d.sectionMappingHint}>
                      <div className="flex flex-col gap-2">
                        {mapping.map((row, index) => (
                          <div className="flex flex-wrap items-center gap-2" key={`mapping-${index}`}>
                            <input
                              className="input input-sm min-w-0 flex-1 font-mono text-[12px]"
                              value={row.from}
                              list="channel-model-options"
                              placeholder={d.mappingFrom}
                              aria-label={d.mappingFrom}
                              onChange={(event) => setMapping((current) => current.map((item, position) => position === index ? { ...item, from: event.target.value } : item))}
                            />
                            <span className="text-muted-foreground">→</span>
                            <input
                              className="input input-sm min-w-0 flex-1 font-mono text-[12px]"
                              value={row.to}
                              list="channel-upstream-model-options"
                              placeholder={d.mappingTo}
                              aria-label={d.mappingTo}
                              onChange={(event) => setMapping((current) => current.map((item, position) => position === index ? { ...item, to: event.target.value } : item))}
                            />
                            <Button type="button" size="sm" variant="ghost" onClick={() => setMapping((current) => current.filter((_, position) => position !== index))} aria-label={d.mappingRemove}>
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                        {!mapping.length && <p className="text-[12px] text-muted-foreground">{d.mappingEmpty}</p>}
                        <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setMapping((current) => [...current, { from: "", to: "" }])}>
                          <Plus className="size-3.5" />
                          {d.mappingAdd}
                        </Button>
                        {duplicateSources.length > 0 && <p role="alert" className="text-[12px] text-error">{interpolate(d.mappingDuplicate, { models: duplicateSources.join(", ") })}</p>}
                      </div>
                      <datalist id="channel-model-options">
                        {models.map((model) => <option key={model} value={model} />)}
                      </datalist>
                      <datalist id="channel-upstream-model-options">
                        {(discovered ?? models).map((model) => <option key={model} value={model} />)}
                      </datalist>
                    </Section>
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="mt-5">
                  <div className="flex flex-col gap-4">
                    <Section title={d.sectionOverrides} description={d.sectionOverridesHint}>
                      <Field htmlFor="channel-headers" title={d.headers} hint={headersJson.error ? d.invalidJson : d.headersHint}>
                        <textarea
                          id="channel-headers"
                          className="textarea textarea-sm w-full font-mono text-[12px]"
                          rows={3}
                          value={headersText}
                          onChange={(event) => setHeadersText(event.target.value)}
                          placeholder={`{\n  "OpenAI-Organization": "org-xxx"\n}`}
                          aria-invalid={Boolean(headersJson.error)}
                          spellCheck={false}
                        />
                      </Field>
                      <Field htmlFor="channel-params" title={d.paramOverride} hint={paramJson.error ? d.invalidJson : d.paramOverrideHint}>
                        <textarea
                          id="channel-params"
                          className="textarea textarea-sm w-full font-mono text-[12px]"
                          rows={3}
                          value={paramText}
                          onChange={(event) => setParamText(event.target.value)}
                          placeholder={`{\n  "temperature": 0.7\n}`}
                          aria-invalid={Boolean(paramJson.error)}
                          spellCheck={false}
                        />
                      </Field>
                    </Section>

                    <Section title={d.sectionVideo} description={d.videoHint}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field htmlFor="channel-video-submit" title={d.videoSubmitPath}>
                          <input id="channel-video-submit" className="input input-sm w-full font-mono text-[12px]" value={videoSubmitPath} onChange={(event) => setVideoSubmitPath(event.target.value)} placeholder="/videos" spellCheck={false} />
                        </Field>
                        <Field htmlFor="channel-video-status" title={d.videoStatusPath}>
                          <input id="channel-video-status" className="input input-sm w-full font-mono text-[12px]" value={videoStatusPath} onChange={(event) => setVideoStatusPath(event.target.value)} placeholder="/videos/{id}" spellCheck={false} />
                        </Field>
                      </div>
                      <Field htmlFor="channel-tag" title={d.tag} hint={d.tagHint}>
                        <input id="channel-tag" className="input input-sm w-full" value={tag} onChange={(event) => setTag(event.target.value)} placeholder={d.tagPlaceholder} />
                      </Field>
                    </Section>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-6 py-4">
              {error && <p role="alert" className="alert alert-error alert-soft py-2 text-[12px]">{error}</p>}
              <div className="flex items-center gap-3">
                <Button type="submit" variant="brand" disabled={busy}>
                  {busy && <span className="loading loading-spinner loading-xs" />}
                  {busy ? d.saving : editing ? d.update : d.create}
                </Button>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{d.cancel}</Button>
                {onDeleted && editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-auto text-destructive"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(d.deleteConfirm)) return;
                      setBusy(true);
                      void onDeleted().then(() => onOpenChange(false)).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setBusy(false));
                    }}
                  >
                    {d.delete}
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
