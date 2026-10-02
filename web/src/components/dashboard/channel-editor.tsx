"use client";

import * as React from "react";
import { AlertTriangle, Plus, RefreshCw, Server, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDictionary, interpolate } from "@/lib/i18n";
import { Chip, FetchedModels, Field, ProviderPicker, PROVIDERS, Section, StatusDot, type ChannelEditorDictionary, type Indicator } from "./channel-editor-parts";
import type { Locale } from "@/lib/i18n/config";
import type { ChannelType, EvaluateProtocol, MultiKeyMode } from "@/lib/relay/types";
import type { ImageProtocolConfig } from "@/lib/relay/image-protocol";
import type { VideoProtocolConfig } from "@/lib/relay/video-protocol";
import type { ChannelDraft } from "@/lib/relay/channel-draft";

/** Normalized channel body accepted by `/api/workspaces/:wid/channels` and `/api/admin/channels`. */
export type ChannelSubmit = Omit<ChannelDraft, "id" | "keyCount" | "lastError" | "modelMapping" | "headers" | "paramOverride" | "tag" | "videoSubmitPath" | "videoStatusPath" | "videoProtocolConfig" | "evaluatePath" | "evaluateProtocol"> & {
  keys?: string[];
  modelMapping?: Record<string, string>;
  headers?: Record<string, string>;
  paramOverride?: Record<string, unknown>;
  tag?: string;
  videoSubmitPath?: string;
  videoStatusPath?: string;
  videoProtocolConfig?: VideoProtocolConfig | null;
  evaluatePath?: string;
  evaluateProtocol?: EvaluateProtocol;
};

export type ChannelDiscoveryRequest = {
  baseUrl: string;
  keys: string[];
  channelId?: string;
  headers?: Record<string, string>;
  protocol?: string;
};
export type ChannelDetection = { protocol: string; base?: string; model?: string; ok: boolean; status?: number; ms: number; error?: string };

type TabKey = "connection" | "routing" | "advanced";
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

/**
 * Channel add/edit panel. Mirrors the New-API channel drawer: a side sheet whose
 * first step picks an upstream provider and whose second step edits a grouped,
 * tabbed configuration whose first tab is a two-column grid.
 */
export function ChannelEditorPanel(props: ChannelEditorProps) {
  const [busy, setBusy] = React.useState(false);
  // Remounting the body on every open re-seeds the form from `initial`; the Radix
  // portal keeps closed children mounted, so neither `key` alone nor an effect on
  // `open` would reliably reset the draft.
  const [session, setSession] = React.useState(0);
  const [wasOpen, setWasOpen] = React.useState(props.open);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setSession((value) => value + 1);
  }

  return (
    <Sheet open={props.open} onOpenChange={(next) => { if (!busy) props.onOpenChange(next); }}>
      <SheetContent side="right" className="w-full max-w-3xl gap-0 p-0" aria-describedby={undefined}>
        <ChannelEditorBody key={session} {...props} busy={busy} setBusy={setBusy} />
      </SheetContent>
    </Sheet>
  );
}

type ChannelEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  /** `null` (or omitted) opens the panel in create mode. */
  initial?: ChannelDraft | null;
  onSubmit: (payload: ChannelSubmit) => Promise<void>;
  /** Absent when the surface cannot reach the discovery endpoint. */
  discover?: (input: ChannelDiscoveryRequest) => Promise<string[]>;
  detect?: (input: ChannelDiscoveryRequest & { model?: string }) => Promise<ChannelDetection[]>;
  /** Absent when the surface deletes channels elsewhere. */
  onDeleted?: () => Promise<void>;
};

/** Holds the draft; remounted (and re-seeded) whenever the panel opens. */
function ChannelEditorBody({ locale, initial, onSubmit, discover, detect, onDeleted, onOpenChange, busy, setBusy }: ChannelEditorProps & { busy: boolean; setBusy: (value: boolean) => void }) {
  const d: ChannelEditorDictionary = getDictionary(locale).dashboard.components.channelEditor;
  const editing = Boolean(initial);

  const [stage, setStage] = React.useState<"provider" | "form">(initial ? "form" : "provider");
  const [providerQuery, setProviderQuery] = React.useState("");
  const [providerId, setProviderId] = React.useState<string>(initial ? PROVIDERS.find((provider) => provider.baseUrl === initial.baseUrl)?.id ?? "custom" : "openai");
  const [name, setName] = React.useState(initial?.name ?? "");
  const [type, setType] = React.useState<ChannelType>(initial?.type ?? "openai-compatible");
  const [baseUrl, setBaseUrl] = React.useState(initial?.baseUrl ?? "");
  const [enabled, setEnabled] = React.useState(initial ? initial.status === 1 : true);
  const [keysText, setKeysText] = React.useState("");
  const [multiKeyMode, setMultiKeyMode] = React.useState<MultiKeyMode>(initial?.multiKeyMode ?? "random");
  const [autoBan, setAutoBan] = React.useState(initial?.autoBan ?? true);
  const [models, setModels] = React.useState<string[]>(initial?.models ?? []);
  const [modelInput, setModelInput] = React.useState("");
  const [groups, setGroups] = React.useState<string[]>(initial?.groups.length ? initial.groups : ["default"]);
  const [groupInput, setGroupInput] = React.useState("");
  const [priority, setPriority] = React.useState(initial?.priority ?? 0);
  const [weight, setWeight] = React.useState(initial?.weight ?? 0);
  const [mapping, setMapping] = React.useState<{ from: string; to: string }[]>(initial ? Object.entries(initial.modelMapping).map(([from, to]) => ({ from, to })) : []);
  const [protocolBasesText, setProtocolBasesText] = React.useState(initial?.protocolBases && Object.keys(initial.protocolBases).length ? JSON.stringify(initial.protocolBases, null, 2) : "");
  const [modelProtocols, setModelProtocols] = React.useState<Record<string, string>>(initial?.modelProtocols ?? {});
  const [headersText, setHeadersText] = React.useState(initial?.headers && Object.keys(initial.headers).length ? JSON.stringify(initial.headers, null, 2) : "");
  const [paramText, setParamText] = React.useState(initial?.paramOverride && Object.keys(initial.paramOverride).length ? JSON.stringify(initial.paramOverride, null, 2) : "");
  const [imageProtocolText, setImageProtocolText] = React.useState(initial?.imageProtocolConfig ? JSON.stringify(initial.imageProtocolConfig, null, 2) : "");
  const [videoProtocolText, setVideoProtocolText] = React.useState(initial?.videoProtocolConfig ? JSON.stringify(initial.videoProtocolConfig, null, 2) : "");
  const [tag, setTag] = React.useState(initial?.tag ?? "");
  const [videoSubmitPath, setVideoSubmitPath] = React.useState(initial?.videoSubmitPath ?? "");
  const [videoStatusPath, setVideoStatusPath] = React.useState(initial?.videoStatusPath ?? "");
  const [evaluatePath, setEvaluatePath] = React.useState(initial?.evaluatePath ?? "");
  const [evaluateProtocol, setEvaluateProtocol] = React.useState<EvaluateProtocol>(initial?.evaluateProtocol ?? "generic");

  const [discovered, setDiscovered] = React.useState<string[] | null>(null);
  const [discovering, setDiscovering] = React.useState(false);
  const [discoverError, setDiscoverError] = React.useState("");
  const [detections, setDetections] = React.useState<ChannelDetection[] | null>(null);
  const [detecting, setDetecting] = React.useState(false);
  const [fetchedQuery, setFetchedQuery] = React.useState("");
  const [error, setError] = React.useState("");
  const [tab, setTab] = React.useState<TabKey>("connection");

  const headersJson = React.useMemo(() => parseJsonObject(headersText), [headersText]);
  const paramJson = React.useMemo(() => parseJsonObject(paramText), [paramText]);
  const protocolBasesJson = React.useMemo(() => parseJsonObject(protocolBasesText), [protocolBasesText]);
  const imageProtocolJson = React.useMemo(() => parseJsonObject(imageProtocolText), [imageProtocolText]);
  const videoProtocolJson = React.useMemo(() => parseJsonObject(videoProtocolText), [videoProtocolText]);
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

  const connectionReady = Boolean(name.trim() && /^https?:\/\/.+/.test(baseUrl.trim()) && models.length && groups.length);
  const indicator = (key: TabKey): Indicator => {
    if (key === "connection") {
      if (connectionReady) return "configured";
      return "incomplete";
    }
    if (key === "routing") return mapping.length ? "configured" : "idle";
    if (headersJson.error || paramJson.error || protocolBasesJson.error || imageProtocolJson.error || videoProtocolJson.error) return "error";
    return tag || headersText.trim() || paramText.trim() || imageProtocolText.trim() || videoProtocolText.trim() || videoSubmitPath || videoStatusPath || evaluatePath ? "configured" : "idle";
  };
  const indicatorLabel = (state: Indicator, required: boolean) =>
    state === "error" ? d.stateError : state === "configured" ? d.stateConfigured : required ? d.stateIncomplete : d.stateConfigured;

  function chooseProvider(provider: (typeof PROVIDERS)[number] | null) {
    if (provider) {
      setProviderId(provider.id);
      setType(provider.type);
      setBaseUrl(provider.baseUrl);
      setEvaluateProtocol(provider.evaluateProtocol ?? "generic");
      setEvaluatePath(provider.evaluatePath ?? "");
      if (provider.models?.length && !models.length) setModels(provider.models);
      if (provider.modelMapping) setMapping(Object.entries(provider.modelMapping).map(([from, to]) => ({ from, to })));
      if (!name.trim()) setName(provider.label);
    } else {
      setProviderId("custom");
      setBaseUrl("");
      setEvaluateProtocol("generic");
      setEvaluatePath("");
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
        protocol: type,
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

  async function runDetection() {
    if (!detect) return;
    setDetecting(true); setDiscoverError("");
    try {
      setDetections(await detect({ baseUrl: baseUrl.trim(), protocol: type, keys: splitList(keysText), channelId: initial?.id, model: models[0] }));
    } catch (cause) {
      setDetections(null); setDiscoverError(cause instanceof Error ? cause.message : String(cause));
    } finally { setDetecting(false); }
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
    if (!/^https?:\/\/.+/.test(url)) return setError(d.invalidBaseUrl);
    if (!models.length) return setError(d.requiredModels);
    if (!groups.length) return setError(d.requiredGroups);
    if (duplicateSources.length) return setError(interpolate(d.mappingDuplicate, { models: duplicateSources.join(", ") }));
    if (headersJson.error || paramJson.error || protocolBasesJson.error || imageProtocolJson.error || videoProtocolJson.error) return setError(d.invalidJson);
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
      modelMapping: Object.fromEntries(mapping.filter(row => row.from.trim()).map(row => [row.from.trim(), row.to.trim()])),
      protocolBases: protocolBasesJson.value ? Object.fromEntries(Object.entries(protocolBasesJson.value).map(([key, value]) => [key, String(value)])) : {},
      modelProtocols,
      headers: headersJson.value ? Object.fromEntries(Object.entries(headersJson.value).map(([key, value]) => [key, String(value)])) : {},
      paramOverride: paramJson.value || {},
      imageProtocolConfig: imageProtocolJson.value ? imageProtocolJson.value as unknown as ImageProtocolConfig : null,
      videoProtocolConfig: videoProtocolJson.value ? videoProtocolJson.value as unknown as VideoProtocolConfig : null,
      tag: tag.trim(), videoSubmitPath: videoSubmitPath.trim(), videoStatusPath: videoStatusPath.trim(),
      evaluatePath: evaluatePath.trim(), evaluateProtocol,

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
    <>
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
                          <option value="anthropic">Anthropic</option>
                          <option value="gemini">Gemini</option>
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
                      {detect && <div className="mt-2"><Button type="button" size="sm" variant="outlineBrand" onClick={() => void runDetection()} disabled={detecting || !baseUrl.trim()}><RefreshCw className="size-3.5" />{detecting ? (locale === "zh" ? "正在探测协议" : "Detecting APIs") : (locale === "zh" ? "探测支持的协议" : "Detect supported APIs")}</Button></div>}
                      {detections && <div className="mt-3 space-y-1.5 rounded-sm border border-border p-3 text-xs"><p className="font-medium">{locale === "zh" ? "协议探测结果" : "Protocol detection"}</p>{detections.map((item) => <div key={item.protocol} className="flex flex-wrap items-center gap-2"><span className="w-20 font-mono">{item.protocol}</span><span className={item.ok ? "text-success" : "text-error"}>{item.ok ? "OK" : (item.status || "FAIL")}</span><span className="text-muted-foreground">{item.ms} ms</span>{item.error && <span className="break-all text-muted-foreground">{item.error}</span>}</div>)}</div>}
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
                  <Section title={locale === "zh" ? "模型协议" : "Model API"} description={locale === "zh" ? "为同一渠道中的模型选择实际使用的上游协议。留空表示使用渠道默认协议。" : "Choose the upstream API for each model. Empty uses the channel default."}>
                    <div className="flex flex-col gap-2">
                      {models.map((model) => <div key={model} className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,13rem)] items-center gap-2"><span className="truncate font-mono text-xs" title={model}>{model}</span><select className="select select-sm" value={modelProtocols[model] ?? ""} onChange={(event) => setModelProtocols((current) => { const next = { ...current }; if (event.target.value) next[model] = event.target.value; else delete next[model]; return next; })}><option value="">{locale === "zh" ? "自动（默认）" : "Auto (default)"}</option><option value="openai">OpenAI Chat</option><option value="responses">OpenAI Responses</option><option value="anthropic">Anthropic Messages</option><option value="gemini">Gemini</option></select></div>)}
                      {!models.length && <p className="text-xs text-muted-foreground">{locale === "zh" ? "先添加模型。" : "Add models first."}</p>}
                    </div>
                  </Section>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="mt-5">
                <div className="flex flex-col gap-4">
                  <Section title={locale === "zh" ? "协议地址" : "Protocol bases"} description={locale === "zh" ? "可选。JSON 键为 openai、responses、anthropic 或 gemini。" : "Optional JSON bases for openai, responses, anthropic, or gemini."}>
                    <textarea className="textarea textarea-sm w-full font-mono text-[12px]" rows={4} value={protocolBasesText} onChange={(event) => setProtocolBasesText(event.target.value)} placeholder={'{\n  "anthropic": "https://relay.example.com",\n  "responses": "https://relay.example.com/v1"\n}'} aria-invalid={Boolean(protocolBasesJson.error)} spellCheck={false} />
                  </Section>
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

                  <Section title={d.imageProtocolTitle} description={d.imageProtocolHint}>
                    <Field htmlFor="channel-image-protocol" title={d.imageProtocolTitle} hint={imageProtocolJson.error ? d.invalidJson : d.imageProtocolHelp}>
                      <textarea
                        id="channel-image-protocol"
                        className="textarea textarea-sm w-full font-mono text-[12px]"
                        rows={12}
                        value={imageProtocolText}
                        onChange={(event) => setImageProtocolText(event.target.value)}
                        placeholder={d.imageProtocolPlaceholder}
                        aria-invalid={Boolean(imageProtocolJson.error)}
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
                    <Field htmlFor="channel-video-protocol" title={d.videoProtocolTitle} hint={d.videoProtocolHelp}>
                      <textarea
                        id="channel-video-protocol"
                        className="textarea textarea-sm w-full font-mono text-[12px]"
                        rows={16}
                        value={videoProtocolText}
                        onChange={(event) => setVideoProtocolText(event.target.value)}
                        placeholder={d.videoProtocolPlaceholder}
                        aria-invalid={Boolean(videoProtocolJson.error)}
                        spellCheck={false}
                      />
                    </Field>
                    <Field htmlFor="channel-tag" title={d.tag} hint={d.tagHint}>
                      <input id="channel-tag" className="input input-sm w-full" value={tag} onChange={(event) => setTag(event.target.value)} placeholder={d.tagPlaceholder} />
                    </Field>
                  </Section>

                  <Section title={d.sectionEvaluation} description={d.evaluationHint}>
                    <Field htmlFor="channel-evaluate-path" title={d.evaluatePath} hint={d.evaluatePathHint}>
                      <input id="channel-evaluate-path" className="input input-sm w-full font-mono text-[12px]" value={evaluatePath} onChange={(event) => setEvaluatePath(event.target.value)} placeholder="/evaluate" spellCheck={false} />
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
    </>
  );
}
