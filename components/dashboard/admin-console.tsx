"use client";

import * as React from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/lib/i18n/config";
import type { Ability, Channel } from "@/lib/relay/types";

type Overview = {
  channels: { total: number; enabled: number; autoDisabled: number };
  groups: Record<string, number>;
  usage: { total_requests: number; requests_24h: number; usd_24h: number };
  settings: {
    retryTimes: number;
    autoDisableEnabled: boolean;
    requestTimeoutMs: number;
    fallbackModelRatio: number;
    groupRatio: Record<string, number>;
  };
};
type Snapshot = { overview: Overview; channels: Channel[]; abilities: Ability[] };
type Editor = { kind: "channels"; item?: Channel };
type Routing = { group: string; model: string; layers: { priority: number; channels: { id: number; name: string; weight: number; share: number }[] }[] };
type Translate = (en: string, zh: string) => string;

async function requestAdmin<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/admin/${path}`, { ...init, headers, cache: "no-store", credentials: "same-origin" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  if (body === null) throw new Error("The server returned an invalid response.");
  return body as T;
}

function Field({ name, title, children }: { name: string; title: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-2"><Label htmlFor={name}>{title}</Label>{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

function ResourceEditor({ editor, busy, t, onSave, onCancel }: {
  editor: Editor; busy: boolean; t: Translate;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const item = editor.item;
  const channel = editor.item;
  const [error, setError] = React.useState("");
  const prefix = "channels";
  const id = (name: string) => `${prefix}-${name}`;
  const input = (name: string, title: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field name={id(name)} title={title}><Input id={id(name)} name={name} {...props} /></Field>
  );
  const area = (name: string, title: string, props: React.ComponentProps<typeof Textarea> = {}) => (
    <Field name={id(name)} title={title}><Textarea id={id(name)} name={name} rows={3} {...props} /></Field>
  );
  const list = (value: FormDataEntryValue | null) => String(value ?? "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const body: Record<string, unknown> = { name: text("name") };
    const models = list(data.get("models"));
    const keys = list(data.get("keys"));
    if (!body.name) { setError(t("Enter a name.", "请输入名称。")); return; }
    if (!models.length || (!item && !keys.length)) {
      setError(t("Add at least one model and an upstream key for a new channel.", "新渠道至少需要一个模型和一个上游密钥。")); return;
    }
    Object.assign(body, {
      type: text("type"), baseUrl: text("baseUrl"), models,
      groups: list(data.get("groups")), priority: Number(data.get("priority")), weight: Number(data.get("weight")),
      multiKeyMode: text("multiKeyMode"), autoBan: data.get("autoBan") === "on",
    });
    if (!(body.groups as string[]).length) { setError(t("Add at least one group.", "请至少填写一个分组。")); return; }
    if (keys.length) body.keys = keys;
    await onSave(body);
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-border bg-card p-5 sm:p-6">
      <h3 className="mb-5 text-base font-semibold">{item ? t("Edit", "编辑") : t("Create", "创建")} {t("channel", "渠道")}</h3>
      <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
      <>
        {input("name", t("Name", "名称"), { defaultValue: item?.name, required: true, autoFocus: true })}
        <Field name={id("type")} title={t("Protocol", "协议")}>
            <select id={id("type")} name="type" defaultValue={channel?.type ?? "openai-compatible"} className="h-9 rounded-sm border border-input bg-background px-3 text-sm focus-visible:outline-ring">
              <option value="openai-compatible">OpenAI compatible</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option>
            </select>
          </Field>
          {input("baseUrl", t("Upstream base URL", "上游基础地址"), { defaultValue: channel?.baseUrl, type: "url", required: true, placeholder: "https://api.openai.com/v1" })}
          {input("groups", t("Groups (comma-separated)", "分组（逗号分隔）"), { defaultValue: channel?.groups.join(", ") ?? "default", required: true })}
          {area("models", t("Model IDs (comma-separated or one per line)", "模型 ID（逗号或换行分隔）"), { defaultValue: channel?.models.join("\n"), required: true })}
          {area("keys", item ? t("Replace upstream keys (leave blank to keep)", "替换上游密钥（留空保持不变）") : t("Upstream keys (one per line)", "上游密钥（每行一个）"), { required: !item, autoComplete: "off", spellCheck: false })}
          {input("priority", t("Priority (higher is tried first)", "优先级（越高越先使用）"), { type: "number", step: 1, defaultValue: channel?.priority ?? 0, required: true })}
          {input("weight", t("Weight within priority", "同优先级内的权重"), { type: "number", min: 0, step: 1, defaultValue: channel?.weight ?? 0, required: true })}
          <Field name={id("multiKeyMode")} title={t("Upstream key selection", "上游密钥选择策略")}>
            <select id={id("multiKeyMode")} name="multiKeyMode" defaultValue={channel?.multiKeyMode ?? "random"} className="h-9 rounded-sm border border-input bg-background px-3 text-sm focus-visible:outline-ring"><option value="random">{t("Random", "随机")}</option><option value="polling">{t("Round robin", "轮询")}</option></select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoBan" defaultChecked={channel?.autoBan ?? true} />{t("Allow automatic disabling after upstream failures", "上游失败后允许自动禁用")}</label>
        </>
        {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <div className="flex gap-3 sm:col-span-2"><Button type="submit">{busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}{t("Save", "保存")}</Button><Button type="button" variant="outline" onClick={onCancel}>{t("Cancel", "取消")}</Button></div>
      </fieldset>
    </form>
  );
}

export function AdminConsole({ locale, section = "overview" }: { locale: Locale; section?: "overview" | "channels" | "groups" }) {
  const t: Translate = (en, zh) => locale === "zh" ? zh : en;
  const [revision, setRevision] = React.useState(0);
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [mutationError, setMutationError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [model, setModel] = React.useState("");
  const [routing, setRouting] = React.useState<Routing | null>(null);
  const [editor, setEditor] = React.useState<Editor | null>(null);
  const [notice, setNotice] = React.useState("");
  const [group, setGroup] = React.useState("");
  const [routeLoading, setRouteLoading] = React.useState(false);
  const [routeError, setRouteError] = React.useState("");
  const routeGeneration = React.useRef(0);

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const init = { signal: controller.signal };
        const [overview, channels, abilities] = await Promise.all([
          requestAdmin<Overview>("overview", init),
          requestAdmin<{ data: Channel[] }>("channels", init),
          requestAdmin<{ data: Ability[] }>("abilities", init),
        ]);
        if (!controller.signal.aborted) setSnapshot({ overview, channels: channels.data, abilities: abilities.data });
      } catch (cause) {
        if (!controller.signal.aborted) { setSnapshot(null); setError(cause instanceof Error ? cause.message : String(cause)); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  function resetRouting() {
    routeGeneration.current += 1;
    setRouting(null); setRouteError(""); setRouteLoading(false);
  }

  function refresh() { resetRouting(); setRevision((value) => value + 1); }

  async function mutate(path: string, method: string, body?: Record<string, unknown>) {
    setBusy(true); setMutationError(""); setNotice("");
    try {
      await requestAdmin<Channel>(path, { method, body: body ? JSON.stringify(body) : undefined });
      setEditor(null);
      setNotice(method === "DELETE" ? t("Deleted.", "已删除。") : t("Saved.", "已保存。"));
      refresh();
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function inspectRouting() {
    const generation = ++routeGeneration.current;
    setRouteLoading(true); setRouteError(""); setRouting(null);
    try {
      const result = await requestAdmin<Routing>(`abilities?${new URLSearchParams({ group, model })}`);
      if (generation === routeGeneration.current) setRouting(result);
    } catch (cause) { if (generation === routeGeneration.current) setRouteError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (generation === routeGeneration.current) setRouteLoading(false); }
  }

  const currencyFormat = React.useMemo(() => new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }), [locale]);
  const usd = currencyFormat.format;
  const disabled = busy || loading;
  const abilities = snapshot?.abilities.filter((ability) => (!group || ability.group === group) && (!model || ability.model === model)) ?? [];
  const groups = [...new Set(snapshot?.abilities.map((ability) => ability.group))].sort();
  const models = [...new Set(snapshot?.abilities.filter((ability) => !group || ability.group === group).map((ability) => ability.model))].sort();
  const status = (value: number) => value === 1 ? t("Enabled", "已启用") : value === 2 ? t("Auto-disabled", "自动禁用") : t("Disabled", "已禁用");
  function actions(item: Channel) {
    return <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => { setEditor({ kind: "channels", item }); setMutationError(""); }}>{t("Edit", "编辑")}</Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => void mutate(`channels/${item.id}`, "PATCH", { status: item.status === 1 ? 3 : 1 })}>{item.status === 1 ? t("Disable", "禁用") : t("Enable", "启用")}</Button>
      <Button size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={() => { if (window.confirm(t(`Delete “${item.name}”? This cannot be undone.`, `删除“${item.name}”？此操作无法撤销。`))) void mutate(`channels/${item.id}`, "DELETE"); }}>{t("Delete", "删除")}</Button>
    </div>;
  }

  const title = section === "channels" ? t("Channels", "渠道") : section === "groups" ? t("Groups", "分组") : t("Relay administration", "中转管理");
  const description = section === "channels" ? t("Manage upstream providers, credentials, and routing priority.", "管理上游服务商、凭证与路由优先级。") : section === "groups" ? t("Inspect the models and channel layers available to each group.", "查看每个分组可用的模型与渠道分层。") : t("Monitor the live relay inventory and configuration.", "查看实时中转资源与配置。");

  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[22px] font-semibold tracking-tight">{title}</h1><p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{description}</p></div><Button variant="outline" onClick={refresh} disabled={disabled}><RefreshCw className="size-4" />{t("Refresh", "刷新")}</Button></div>
    {error && <div role="alert" className="rounded-md border border-destructive/30 bg-card p-4 text-sm"><p className="font-medium text-destructive">{error}</p><p className="mt-2 text-muted-foreground">{t("Your account needs administrator permission to use this area.", "当前账号需要管理员权限才能使用此区域。")}</p></div>}
    {mutationError && <p role="alert" className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">{mutationError}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {loading && <p role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t("Loading live relay data…", "正在加载实时中转数据…")}</p>}
    {snapshot && section === "overview" && <div className="space-y-8">
      <section><h2 className="mb-4 text-base font-semibold">{t("Live inventory and usage", "实时资源与用量")}</h2><dl className="grid gap-x-8 gap-y-5 rounded-md border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-3">{[[t("Channels / enabled", "渠道总数 / 启用"), `${snapshot.overview.channels.total} / ${snapshot.overview.channels.enabled}`], [t("Automatically disabled channels", "自动禁用渠道"), snapshot.overview.channels.autoDisabled], [t("Recorded requests", "已记录请求"), snapshot.overview.usage.total_requests], [t("Requests · last 24 hours", "最近 24 小时请求"), snapshot.overview.usage.requests_24h], [t("Usage · last 24 hours", "最近 24 小时用量"), usd(snapshot.overview.usage.usd_24h)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-medium tabular-nums">{value}</dd></div>)}</dl></section>
      <section><h2 className="mb-3 text-base font-semibold">{t("Models by enabled group", "已启用分组的模型")}</h2>{Object.keys(snapshot.overview.groups).length ? <Table><TableHeader><TableRow><TableHead>{t("Group", "分组")}</TableHead><TableHead>{t("Models", "模型数量")}</TableHead></TableRow></TableHeader><TableBody>{Object.entries(snapshot.overview.groups).map(([name, count]) => <TableRow key={name}><TableCell>{name}</TableCell><TableCell className="tabular-nums">{count}</TableCell></TableRow>)}</TableBody></Table> : <Empty>{t("No enabled groups. Add or enable a channel to make models available.", "暂无启用的分组。添加或启用渠道后即可提供模型。")}</Empty>}</section>
      <section><h2 className="mb-3 text-base font-semibold">{t("Current relay settings", "当前中转设置")}</h2><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{t("Retries", "重试次数")}</dt><dd>{snapshot.overview.settings.retryTimes}</dd></div><div><dt className="text-muted-foreground">{t("Request timeout", "请求超时")}</dt><dd>{snapshot.overview.settings.requestTimeoutMs} ms</dd></div><div><dt className="text-muted-foreground">{t("Automatic disabling", "自动禁用")}</dt><dd>{snapshot.overview.settings.autoDisableEnabled ? t("Enabled", "已启用") : t("Disabled", "已禁用")}</dd></div><div><dt className="text-muted-foreground">{t("Fallback model ratio", "默认模型倍率")}</dt><dd>{snapshot.overview.settings.fallbackModelRatio}</dd></div>{Object.entries(snapshot.overview.settings.groupRatio).map(([name, ratio]) => <div key={name}><dt className="text-muted-foreground">{t("Group ratio", "分组倍率")} · {name}</dt><dd>{ratio}</dd></div>)}</dl></section>
    </div>}
    {snapshot && section === "channels" && <div className="space-y-5"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{t("Upstream channels", "上游渠道")}</h2><Button disabled={disabled} onClick={() => { setEditor({ kind: "channels" }); setMutationError(""); }}><Plus className="size-4" />{t("Add channel", "添加渠道")}</Button></div>{editor?.kind === "channels" && <ResourceEditor key={`channel-${editor.item?.id ?? "new"}`} editor={editor} busy={disabled} t={t} onCancel={() => setEditor(null)} onSave={(body) => mutate(editor.item ? `channels/${editor.item.id}` : "channels", editor.item ? "PATCH" : "POST", body)} />}<div className="rounded-md border border-border bg-card">{!snapshot.channels.length ? <Empty>{t("No channels configured. Add an upstream URL, API key, and model IDs to start routing.", "尚未配置渠道。添加上游地址、API 密钥和模型 ID 以启用路由。")}</Empty> : <Table><TableHeader><TableRow>{[t("Channel", "渠道"), t("Status", "状态"), t("Models / groups", "模型 / 分组"), t("Priority / weight", "优先级 / 权重"), t("Actions", "操作")].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}</TableRow></TableHeader><TableBody>{snapshot.channels.map((channel) => <TableRow key={channel.id}><TableCell><p className="font-medium">{channel.name}</p><p className="mt-1 text-xs text-muted-foreground">#{channel.id} · {channel.type}</p><p className="mt-1 max-w-64 break-all whitespace-normal text-xs text-muted-foreground">{channel.baseUrl}</p></TableCell><TableCell><Badge variant="outline">{status(channel.status)}</Badge></TableCell><TableCell><p className="max-w-64 break-words whitespace-normal text-xs">{channel.models.join(", ")}</p><p className="mt-2 text-xs text-muted-foreground">{channel.groups.join(", ")}</p></TableCell><TableCell className="tabular-nums">{channel.priority} / {channel.weight}</TableCell><TableCell>{actions(channel)}</TableCell></TableRow>)}</TableBody></Table>}</div></div>}
    {snapshot && section === "groups" && <div className="space-y-5"><div><h2 className="text-base font-semibold">{t("Group routing", "分组路由")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("Groups are derived from channel configuration. Select a group and model to inspect priority layers and selection shares.", "分组由渠道配置生成。选择分组与模型以查看优先级分层和选择占比。")}</p></div><div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><Field name="ability-group" title={t("Group", "分组")}><select id="ability-group" value={group} onChange={(event) => { setGroup(event.target.value); setModel(""); resetRouting(); }} className="h-9 min-w-0 rounded-sm border border-input bg-background px-3 text-sm"><option value="">{t("All groups", "全部分组")}</option>{groups.map((value) => <option key={value}>{value}</option>)}</select></Field><Field name="ability-model" title={t("Model", "模型")}><select id="ability-model" value={model} onChange={(event) => { setModel(event.target.value); resetRouting(); }} className="h-9 min-w-0 rounded-sm border border-input bg-background px-3 text-sm"><option value="">{t("All models", "全部模型")}</option>{models.map((value) => <option key={value}>{value}</option>)}</select></Field><Button variant="outline" disabled={!group || !model || routeLoading || disabled} onClick={() => void inspectRouting()}>{routeLoading && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}{t("Inspect route", "查看路由")}</Button></div>{routeError && <p role="alert" className="text-sm text-destructive">{routeError}</p>}{routing && <section className="rounded-md border border-border bg-card p-4"><h3 className="text-sm font-semibold">{routing.group} / {routing.model}</h3>{routing.layers.length ? <ol className="mt-3 space-y-3">{routing.layers.map((layer) => <li key={layer.priority}><p className="text-xs font-medium">{t("Priority", "优先级")} {layer.priority}</p><ul className="mt-1 space-y-1 text-sm text-muted-foreground">{layer.channels.map((channel) => <li key={channel.id}>{channel.name} · {t("weight", "权重")} {channel.weight} · {(channel.share * 100).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: 2 })}%</li>)}</ul></li>)}</ol> : <Empty>{t("No enabled channel can serve this route.", "没有已启用的渠道可以服务此路由。")}</Empty>}</section>}<div className="rounded-md border border-border bg-card">{!abilities.length ? <Empty>{t("No matching abilities. Configure channel models and groups, or change your filters.", "暂无匹配能力。请配置渠道模型和分组，或调整筛选条件。")}</Empty> : <Table><TableHeader><TableRow>{[t("Group", "分组"), t("Model", "模型"), t("Channel", "渠道"), t("Status", "状态"), t("Priority / weight", "优先级 / 权重")].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}</TableRow></TableHeader><TableBody>{abilities.map((ability) => <TableRow key={`${ability.group}:${ability.model}:${ability.channelId}`}><TableCell>{ability.group}</TableCell><TableCell>{ability.model}</TableCell><TableCell>{snapshot.channels.find((channel) => channel.id === ability.channelId)?.name ?? `#${ability.channelId}`}</TableCell><TableCell>{ability.enabled ? t("Enabled", "已启用") : t("Disabled", "已禁用")}</TableCell><TableCell className="tabular-nums">{ability.priority} / {ability.weight}</TableCell></TableRow>)}</TableBody></Table>}</div></div>}
  </div>;
}
