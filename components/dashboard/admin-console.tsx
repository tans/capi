"use client";

import * as React from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChannelEditorPanel, type ChannelDiscoveryRequest, type ChannelSubmit } from "@/components/dashboard/channel-editor";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/lib/i18n/config";
import { toChannelDraft } from "@/lib/relay/channel-draft";
import type { Ability, Channel, Group } from "@/lib/relay/types";

type Overview = {
  channels: { total: number; enabled: number; autoDisabled: number };
  groups: Record<string, number>;
  usage: { total_requests: number; requests_24h: number; amount_24h: number; currency: string };
  settings: {
    retryTimes: number;
    autoDisableEnabled: boolean;
    requestTimeoutMs: number;
    fallbackModelRatio: number;
    groupRatio: Record<string, number>;
  };
};
/** Admin listing adds the owning workspace name from `/api/admin/channels`. */
type AdminChannel = Channel & { workspaceName?: string };
type Snapshot = { overview: Overview; channels: AdminChannel[]; abilities: Ability[]; groups: Group[] };
type Routing = { group: string; model: string; layers: { priority: number; channels: { id: number; name: string; weight: number; share: number }[] }[] };
type Translate = (en: string, zh: string) => string;

type GroupDraft = { id: number | null; name: string; displayName: string; ratio: string; description: string; status: 1 | 2 };
const BLANK_GROUP: GroupDraft = { id: null, name: "", displayName: "", ratio: "1", description: "", status: 1 };

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
  const [editor, setEditor] = React.useState<Channel | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [group, setGroup] = React.useState("");
  const [groupDraft, setGroupDraft] = React.useState<GroupDraft>(BLANK_GROUP);
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
        const [overview, channels, abilities, groups] = await Promise.all([
          requestAdmin<Overview>("overview", init),
          requestAdmin<{ data: Channel[] }>("channels", init),
          requestAdmin<{ data: Ability[] }>("abilities", init),
          requestAdmin<{ data: Group[] }>("groups", init),
        ]);
        if (!controller.signal.aborted) setSnapshot({ overview, channels: channels.data, abilities: abilities.data, groups: groups.data });
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

  async function saveChannel(payload: ChannelSubmit) {
    await requestAdmin<Channel>(editor ? `channels/${editor.id}` : "channels", { method: editor ? "PATCH" : "POST", body: JSON.stringify(payload) });
    setEditor(null);
    setNotice(t("Saved.", "已保存。"));
    refresh();
  }

  async function discoverModels(input: ChannelDiscoveryRequest) {
    const result = await requestAdmin<{ data: string[] }>("channels/models", { method: "POST", body: JSON.stringify(input) });
    return result.data;
  }

  async function mutateGroup(path: string, method: string, body?: Record<string, unknown>) {
    setBusy(true); setMutationError(""); setNotice("");
    try {
      await requestAdmin<Group>(path, { method, body: body ? JSON.stringify(body) : undefined });
      setNotice(method === "DELETE" ? t("Deleted.", "已删除。") : t("Saved.", "已保存。"));
      refresh();
      return true;
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : String(cause)); return false; }
    finally { setBusy(false); }
  }

  async function submitGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const editing = groupDraft.id;
    const saved = await mutateGroup(editing === null ? "groups" : `groups/${editing}`, editing === null ? "POST" : "PATCH", {
      name: groupDraft.name,
      displayName: groupDraft.displayName.trim() || groupDraft.name,
      ratio: Number(groupDraft.ratio),
      description: groupDraft.description,
      status: groupDraft.status,
    });
    if (saved) setGroupDraft(BLANK_GROUP);
  }

  async function removeGroup(item: Group) {
    if (!window.confirm(t(`Delete group “${item.name}”? Channels and API keys stop using it.`, `删除分组“${item.name}”？渠道与密钥将不再使用该分组。`))) return;
    if (await mutateGroup(`groups/${item.id}`, "DELETE") && groupDraft.id === item.id) setGroupDraft(BLANK_GROUP);
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

  const formatAmount = (amount: number, currency: string) => `${currency} ${amount.toFixed(4)}`;
  const disabled = busy || loading;
  const abilities = snapshot?.abilities.filter((ability) => (!group || ability.group === group) && (!model || ability.model === model)) ?? [];
  const registeredGroups = snapshot?.groups ?? [];
  const derivedGroups = [...new Set(snapshot?.abilities.map((ability) => ability.group))].sort();
  const routingGroups = [...new Set([...derivedGroups, ...registeredGroups.map((item) => item.name)])].sort();
  const unregisteredGroups = derivedGroups.filter((name) => !registeredGroups.some((item) => item.name === name));
  const models = [...new Set(snapshot?.abilities.filter((ability) => !group || ability.group === group).map((ability) => ability.model))].sort();
  const status = (value: number) => value === 1 ? t("Enabled", "已启用") : value === 2 ? t("Auto-disabled", "自动禁用") : t("Disabled", "已禁用");
  function actions(item: Channel) {
    return <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => { setEditor(item); setEditorOpen(true); setMutationError(""); }}>{t("Edit", "编辑")}</Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => void mutate(`channels/${item.id}`, "PATCH", { status: item.status === 1 ? 3 : 1 })}>{item.status === 1 ? t("Disable", "禁用") : t("Enable", "启用")}</Button>
      <Button size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={() => { if (window.confirm(t(`Delete “${item.name}”? This cannot be undone.`, `删除“${item.name}”？此操作无法撤销。`))) void mutate(`channels/${item.id}`, "DELETE"); }}>{t("Delete", "删除")}</Button>
    </div>;
  }

  const title = section === "channels" ? t("Channels", "渠道") : section === "groups" ? t("Groups", "分组") : t("Relay administration", "中转管理");
  const description = section === "channels" ? t("Manage upstream providers, credentials, and routing priority.", "管理上游服务商、凭证与路由优先级。") : section === "groups" ? t("Create groups, set their fee ratio, and control which channels serve each group.", "创建分组、设置倍率，并控制每个分组由哪些渠道服务。") : t("Monitor the live relay inventory and configuration.", "查看实时中转资源与配置。");

  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[22px] font-semibold tracking-tight">{title}</h1><p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{description}</p></div><Button variant="outline" onClick={refresh} disabled={disabled}><RefreshCw className="size-4" />{t("Refresh", "刷新")}</Button></div>
    {error && <div role="alert" className="rounded-md border border-destructive/30 bg-card p-4 text-sm"><p className="font-medium text-destructive">{error}</p><p className="mt-2 text-muted-foreground">{t("Your account needs administrator permission to use this area.", "当前账号需要管理员权限才能使用此区域。")}</p></div>}
    {mutationError && <p role="alert" className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">{mutationError}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {loading && <p role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t("Loading live relay data…", "正在加载实时中转数据…")}</p>}
    {snapshot && section === "overview" && <div className="space-y-8">
      <section><h2 className="mb-4 text-base font-semibold">{t("Live inventory and usage", "实时资源与用量")}</h2><dl className="grid gap-x-8 gap-y-5 rounded-md border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-3">{[[t("Channels / enabled", "渠道总数 / 启用"), `${snapshot.overview.channels.total} / ${snapshot.overview.channels.enabled}`], [t("Automatically disabled channels", "自动禁用渠道"), snapshot.overview.channels.autoDisabled], [t("Recorded requests", "已记录请求"), snapshot.overview.usage.total_requests], [t("Requests · last 24 hours", "最近 24 小时请求"), snapshot.overview.usage.requests_24h], [t("Usage · last 24 hours", "最近 24 小时用量"), formatAmount(snapshot.overview.usage.amount_24h, snapshot.overview.usage.currency)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-medium tabular-nums">{value}</dd></div>)}</dl></section>
      <section><h2 className="mb-3 text-base font-semibold">{t("Models by enabled group", "已启用分组的模型")}</h2>{Object.keys(snapshot.overview.groups).length ? <Table><TableHeader><TableRow><TableHead>{t("Group", "分组")}</TableHead><TableHead>{t("Models", "模型数量")}</TableHead></TableRow></TableHeader><TableBody>{Object.entries(snapshot.overview.groups).map(([name, count]) => <TableRow key={name}><TableCell>{name}</TableCell><TableCell className="tabular-nums">{count}</TableCell></TableRow>)}</TableBody></Table> : <Empty>{t("No enabled groups. Add or enable a channel to make models available.", "暂无启用的分组。添加或启用渠道后即可提供模型。")}</Empty>}</section>
      <section><h2 className="mb-3 text-base font-semibold">{t("Current relay settings", "当前中转设置")}</h2><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{t("Retries", "重试次数")}</dt><dd>{snapshot.overview.settings.retryTimes}</dd></div><div><dt className="text-muted-foreground">{t("Request timeout", "请求超时")}</dt><dd>{snapshot.overview.settings.requestTimeoutMs} ms</dd></div><div><dt className="text-muted-foreground">{t("Automatic disabling", "自动禁用")}</dt><dd>{snapshot.overview.settings.autoDisableEnabled ? t("Enabled", "已启用") : t("Disabled", "已禁用")}</dd></div><div><dt className="text-muted-foreground">{t("Fallback model ratio", "默认模型倍率")}</dt><dd>{snapshot.overview.settings.fallbackModelRatio}</dd></div>{Object.entries(snapshot.overview.settings.groupRatio).map(([name, ratio]) => <div key={name}><dt className="text-muted-foreground">{t("Group ratio", "分组倍率")} · {name}</dt><dd>{ratio}</dd></div>)}</dl></section>
    </div>}
    {snapshot && section === "channels" && <div className="space-y-5"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{t("Upstream channels", "上游渠道")}</h2><Button disabled={disabled} onClick={() => { setEditor(null); setEditorOpen(true); setMutationError(""); }}><Plus className="size-4" />{t("Add channel", "添加渠道")}</Button></div><ChannelEditorPanel open={editorOpen} onOpenChange={setEditorOpen} locale={locale} initial={editor ? toChannelDraft(editor) : null} onSubmit={saveChannel} discover={discoverModels} /><div className="rounded-md border border-border bg-card">{!snapshot.channels.length ? <Empty>{t("No channels configured. Add an upstream URL, API key, and model IDs to start routing.", "尚未配置渠道。添加上游地址、API 密钥和模型 ID 以启用路由。")}</Empty> : <Table><TableHeader><TableRow>{[t("Channel", "渠道"), t("Status", "状态"), t("Models / groups", "模型 / 分组"), t("Priority / weight", "优先级 / 权重"), t("Actions", "操作")].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}</TableRow></TableHeader><TableBody>{snapshot.channels.map((channel) => <TableRow key={channel.id}><TableCell><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{channel.name}</p><Badge variant="outline" className="normal-case">{channel.ownerType === "workspace" ? t(`Workspace · ${channel.workspaceName}`, `空间 · ${channel.workspaceName}`) : t("Platform", "平台")}</Badge></div><p className="mt-1 text-xs text-muted-foreground">#{channel.id} · {channel.type}</p><p className="mt-1 max-w-64 break-all whitespace-normal text-xs text-muted-foreground">{channel.baseUrl}</p></TableCell><TableCell><Badge variant="outline">{status(channel.status)}</Badge></TableCell><TableCell><p className="max-w-64 break-words whitespace-normal text-xs">{channel.models.join(", ")}</p><p className="mt-2 text-xs text-muted-foreground">{channel.groups.join(", ")}</p></TableCell><TableCell className="tabular-nums">{channel.priority} / {channel.weight}</TableCell><TableCell>{actions(channel)}</TableCell></TableRow>)}</TableBody></Table>}</div></div>}
    {snapshot && section === "groups" && <div className="space-y-5">
      <form onSubmit={submitGroup} className="rounded-md border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{groupDraft.id === null ? t("Add group", "新增分组") : t(`Edit group “${groupDraft.name}”`, `编辑分组“${groupDraft.name}”`)}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("A group decides which channels serve a request and which fee ratio applies. Its name is a permanent identifier used by channels and API keys.", "分组决定请求由哪些渠道服务、适用什么倍率。分组名是不可变标识，渠道与密钥按名引用。")}</p>
          </div>
          {groupDraft.id !== null && <Button type="button" variant="ghost" size="sm" onClick={() => setGroupDraft(BLANK_GROUP)}>{t("Cancel", "取消")}</Button>}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field name="group-name" title={t("Name", "分组名")}>
            <input id="group-name" className="input input-sm w-full font-mono" value={groupDraft.name} onChange={(event) => setGroupDraft((draft) => ({ ...draft, name: event.target.value }))} disabled={groupDraft.id !== null} placeholder="vip" required spellCheck={false} />
          </Field>
          <Field name="group-display-name" title={t("Display name", "显示名")}>
            <input id="group-display-name" className="input input-sm w-full" value={groupDraft.displayName} onChange={(event) => setGroupDraft((draft) => ({ ...draft, displayName: event.target.value }))} placeholder={groupDraft.name || "VIP"} />
          </Field>
          <Field name="group-ratio" title={t("Fee ratio", "倍率")}>
            <input id="group-ratio" className="input input-sm w-full" type="number" min="0" step="0.1" value={groupDraft.ratio} onChange={(event) => setGroupDraft((draft) => ({ ...draft, ratio: event.target.value }))} required />
          </Field>
          <Field name="group-status" title={t("Status", "状态")}>
            <select id="group-status" className="select select-sm w-full" value={groupDraft.status} onChange={(event) => setGroupDraft((draft) => ({ ...draft, status: event.target.value === "2" ? 2 : 1 }))}>
              <option value="1">{t("Enabled", "已启用")}</option>
              <option value="2">{t("Disabled", "已禁用")}</option>
            </select>
          </Field>
          <Field name="group-description" title={t("Description", "说明")}>
            <input id="group-description" className="input input-sm w-full" value={groupDraft.description} onChange={(event) => setGroupDraft((draft) => ({ ...draft, description: event.target.value }))} maxLength={200} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={disabled}><Plus className="size-4" />{groupDraft.id === null ? t("Create group", "创建分组") : t("Save group", "保存分组")}</Button>
          <p className="text-xs text-muted-foreground">{t("1–32 characters, without spaces or commas. Keep the name used by upstream channels.", "1–32 个字符，不含空格和逗号。请沿用上游渠道引用的分组名（可为中文）。")}</p>
        </div>
      </form>

      <div className="rounded-md border border-border bg-card">{!registeredGroups.length ? <Empty>{t("No groups registered yet. Create one to route models and set a fee ratio.", "尚无登记的分组。创建分组即可路由模型并设置倍率。")}</Empty> : <Table>
        <TableHeader><TableRow>{[t("Group", "分组"), t("Ratio", "倍率"), t("Models", "模型数"), t("Channels", "渠道数"), t("Status", "状态"), t("Actions", "操作")].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{registeredGroups.map((item) => {
          const rows = snapshot.abilities.filter((ability) => ability.group === item.name);
          const models = new Set(rows.map((row) => row.model)).size;
          const channels = new Set(rows.map((row) => row.channelId)).size;
          return <TableRow key={item.id}>
            <TableCell><p className="font-mono text-[13px] font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.displayName}{item.description ? ` · ${item.description}` : ""}</p></TableCell>
            <TableCell className="tabular-nums">{item.ratio}</TableCell>
            <TableCell className="tabular-nums">{models}</TableCell>
            <TableCell className="tabular-nums">{channels}</TableCell>
            <TableCell><Badge variant={item.status === 1 ? "secondary" : "outline"}>{item.status === 1 ? t("Enabled", "已启用") : t("Disabled", "已禁用")}</Badge></TableCell>
            <TableCell><div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => { setGroupDraft({ id: item.id, name: item.name, displayName: item.displayName, ratio: String(item.ratio), description: item.description, status: item.status }); setMutationError(""); }}>{t("Edit", "编辑")}</Button>
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => void mutateGroup(`groups/${item.id}`, "PATCH", { status: item.status === 1 ? 2 : 1 })}>{item.status === 1 ? t("Disable", "禁用") : t("Enable", "启用")}</Button>
              <Button size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={() => void removeGroup(item)}>{t("Delete", "删除")}</Button>
            </div></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>}</div>

      {unregisteredGroups.length > 0 && <div className="rounded-md border border-border bg-card p-4">
        <p className="text-sm font-medium">{t("Groups used by channels but not registered", "渠道在用但未登记的分组")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("Registering a group adds a display name, a fee ratio, and an enable switch. Select one to fill the form.", "登记分组后才能配置显示名、倍率与启停。点击分组名即可填入表单。")}</p>
        <div className="mt-3 flex flex-wrap gap-2">{unregisteredGroups.map((name) => <button key={name} type="button" className="badge badge-outline font-mono" onClick={() => { setGroupDraft({ ...BLANK_GROUP, name }); setMutationError(""); }}>{name}</button>)}</div>
      </div>}

      <div><h2 className="text-base font-semibold">{t("Group routing", "分组路由")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("Select a group and model to inspect priority layers and selection shares.", "选择分组与模型以查看优先级分层和选择占比。")}</p></div>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><Field name="ability-group" title={t("Group", "分组")}><select id="ability-group" value={group} onChange={(event) => { setGroup(event.target.value); setModel(""); resetRouting(); }} className="h-9 min-w-0 rounded-sm border border-input bg-background px-3 text-sm"><option value="">{t("All groups", "全部分组")}</option>{routingGroups.map((value) => <option key={value}>{value}</option>)}</select></Field><Field name="ability-model" title={t("Model", "模型")}><select id="ability-model" value={model} onChange={(event) => { setModel(event.target.value); resetRouting(); }} className="h-9 min-w-0 rounded-sm border border-input bg-background px-3 text-sm"><option value="">{t("All models", "全部模型")}</option>{models.map((value) => <option key={value}>{value}</option>)}</select></Field><Button variant="outline" disabled={!group || !model || routeLoading || disabled} onClick={() => void inspectRouting()}>{routeLoading && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}{t("Inspect route", "查看路由")}</Button></div>{routeError && <p role="alert" className="text-sm text-destructive">{routeError}</p>}{routing && <section className="rounded-md border border-border bg-card p-4"><h3 className="text-sm font-semibold">{routing.group} / {routing.model}</h3>{routing.layers.length ? <ol className="mt-3 space-y-3">{routing.layers.map((layer) => <li key={layer.priority}><p className="text-xs font-medium">{t("Priority", "优先级")} {layer.priority}</p><ul className="mt-1 space-y-1 text-sm text-muted-foreground">{layer.channels.map((channel) => <li key={channel.id}>{channel.name} · {t("weight", "权重")} {channel.weight} · {(channel.share * 100).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: 2 })}%</li>)}</ul></li>)}</ol> : <Empty>{t("No enabled channel can serve this route.", "没有已启用的渠道可以服务此路由。")}</Empty>}</section>}<div className="rounded-md border border-border bg-card">{!abilities.length ? <Empty>{t("No matching abilities. Configure channel models and groups, or change your filters.", "暂无匹配能力。请配置渠道模型和分组，或调整筛选条件。")}</Empty> : <Table><TableHeader><TableRow>{[t("Group", "分组"), t("Model", "模型"), t("Channel", "渠道"), t("Status", "状态"), t("Priority / weight", "优先级 / 权重")].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}</TableRow></TableHeader><TableBody>{abilities.map((ability) => <TableRow key={`${ability.group}:${ability.model}:${ability.channelId}`}><TableCell>{ability.group}</TableCell><TableCell>{ability.model}</TableCell><TableCell>{snapshot.channels.find((channel) => channel.id === ability.channelId)?.name ?? `#${ability.channelId}`}</TableCell><TableCell>{ability.enabled ? t("Enabled", "已启用") : t("Disabled", "已禁用")}</TableCell><TableCell className="tabular-nums">{ability.priority} / {ability.weight}</TableCell></TableRow>)}</TableBody></Table>}</div>
    </div>}
  </div>;
}
