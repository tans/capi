"use client";

import * as React from "react";
import { Copy, Loader2, Plus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/lib/i18n/config";
import type { Ability, ApiKey, Channel } from "@/lib/relay/types";

type Overview = {
  channels: { total: number; enabled: number; autoDisabled: number };
  keys: { total: number; enabled: number };
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
type ListedKey = ApiKey & { remain_usd: number | null; used_usd: number };
type Snapshot = { overview: Overview; channels: Channel[]; keys: ListedKey[]; abilities: Ability[] };
type Editor = { kind: "channels"; item?: Channel } | { kind: "keys"; item?: ListedKey };
type Routing = { group: string; model: string; layers: { priority: number; channels: { id: number; name: string; weight: number; share: number }[] }[] };
type Translate = (en: string, zh: string) => string;

async function requestAdmin<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (token) headers.set("x-admin-token", token);
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
  const channel = editor.kind === "channels" ? editor.item : undefined;
  const key = editor.kind === "keys" ? editor.item : undefined;
  const [error, setError] = React.useState("");
  const [unlimited, setUnlimited] = React.useState(key?.unlimitedQuota ?? false);
  const [modelLimited, setModelLimited] = React.useState(key?.modelLimitsEnabled ?? false);
  const prefix = editor.kind;
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
    if (!body.name) { setError(t("Enter a name.", "请输入名称。")); return; }
    if (editor.kind === "channels") {
      const models = list(data.get("models"));
      const keys = list(data.get("keys"));
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
    } else {
      const quota = Number(data.get("remainUsd"));
      Object.assign(body, {
        group: text("group") || "default", unlimitedQuota: unlimited,
        modelLimitsEnabled: modelLimited, modelLimits: list(data.get("modelLimits")), allowIps: list(data.get("allowIps")),
        expiredTime: text("expiredTime") ? new Date(text("expiredTime")).getTime() : -1,
        crossGroupRetry: data.get("crossGroupRetry") === "on", autoGroups: list(data.get("autoGroups")),
      });
      if (!unlimited && (!Number.isFinite(quota) || quota < 0)) { setError(t("Enter a non-negative balance.", "余额不得小于零。")); return; }
      if (modelLimited && !(body.modelLimits as string[]).length) { setError(t("Add at least one allowed model.", "请至少填写一个允许使用的模型。")); return; }
      if (item && !unlimited) body.remainQuota = Math.round(quota * 500_000);
      else if (!item) body.remainUsd = quota;
    }
    await onSave(body);
  }

  function localDate(timestamp: number) {
    const date = new Date(timestamp);
    return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-border bg-card p-5 sm:p-6">
      <h3 className="mb-5 text-base font-semibold">{item ? t("Edit", "编辑") : t("Create", "创建")} {editor.kind === "channels" ? t("channel", "渠道") : t("API key", "API 密钥")}</h3>
      <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
        {input("name", t("Name", "名称"), { defaultValue: item?.name, required: true, autoFocus: true })}
        {editor.kind === "channels" ? <>
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
        </> : <>
          {input("group", t("Routing group", "路由分组"), { defaultValue: key?.group ?? "default", required: true })}
          {input("remainUsd", t("Remaining balance (USD)", "剩余额度（美元）"), { type: "number", min: 0, step: "0.000001", defaultValue: key ? key.remainQuota / 500_000 : 10, disabled: unlimited, required: !unlimited })}
          {input("expiredTime", t("Expires at (local time, blank means never)", "过期时间（本地时间，留空永不过期）"), { type: "datetime-local", defaultValue: key && key.expiredTime > 0 ? localDate(key.expiredTime) : "" })}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />{t("Unlimited quota", "不限额度")}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modelLimited} onChange={(e) => setModelLimited(e.target.checked)} />{t("Restrict allowed models", "限制可用模型")}</label>
          {area("modelLimits", t("Allowed model IDs (comma-separated)", "允许使用的模型 ID（逗号分隔）"), { defaultValue: key?.modelLimits.join(", "), disabled: !modelLimited, required: modelLimited })}
          {area("allowIps", t("Allowed IPs / CIDRs (blank means unrestricted)", "允许的 IP / CIDR（留空表示不限制）"), { defaultValue: key?.allowIps.join("\n") })}
          {input("autoGroups", t("Auto-group candidates (comma-separated)", "自动分组候选项（逗号分隔）"), { defaultValue: key?.autoGroups.join(", ") })}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="crossGroupRetry" defaultChecked={key?.crossGroupRetry ?? false} />{t("Allow cross-group retries for auto group", "自动分组允许跨组重试")}</label>
        </>}
        {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <div className="flex gap-3 sm:col-span-2"><Button type="submit">{busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}{t("Save", "保存")}</Button><Button type="button" variant="outline" onClick={onCancel}>{t("Cancel", "取消")}</Button></div>
      </fieldset>
    </form>
  );
}

export function AdminConsole({ locale }: { locale: Locale }) {
  const t: Translate = (en, zh) => locale === "zh" ? zh : en;
  const [token, setToken] = React.useState("");
  const [revision, setRevision] = React.useState(0);
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [mutationError, setMutationError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [editor, setEditor] = React.useState<Editor | null>(null);
  const [newSecret, setNewSecret] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [group, setGroup] = React.useState("");
  const [model, setModel] = React.useState("");
  const [routing, setRouting] = React.useState<Routing | null>(null);
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
        const [overview, channels, keys, abilities] = await Promise.all([
          requestAdmin<Overview>("overview", token, init),
          requestAdmin<{ data: Channel[] }>("channels", token, init),
          requestAdmin<{ data: ListedKey[] }>("keys", token, init),
          requestAdmin<{ data: Ability[] }>("abilities", token, init),
        ]);
        if (!controller.signal.aborted) setSnapshot({ overview, channels: channels.data, keys: keys.data, abilities: abilities.data });
      } catch (cause) {
        if (!controller.signal.aborted) { setSnapshot(null); setError(cause instanceof Error ? cause.message : String(cause)); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [token, revision]);

  function resetRouting() {
    routeGeneration.current += 1;
    setRouting(null); setRouteError(""); setRouteLoading(false);
  }

  function refresh() { resetRouting(); setRevision((value) => value + 1); }

  async function mutate(path: string, method: string, body?: Record<string, unknown>) {
    setBusy(true); setMutationError(""); setNotice("");
    try {
      const result = await requestAdmin<ApiKey>(path, token, { method, body: body ? JSON.stringify(body) : undefined });
      if (path === "keys" && method === "POST") { setNewSecret(result.key); setCopied(false); }
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
      const result = await requestAdmin<Routing>(`abilities?${new URLSearchParams({ group, model })}`, token);
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
  const status = (value: number, isChannel: boolean) => value === 1 ? t("Enabled", "已启用") : isChannel && value === 2 ? t("Auto-disabled", "自动禁用") : !isChannel && value === 3 ? t("Expired", "已过期") : t("Disabled", "已禁用");
  function actions(kind: Editor["kind"], item: Channel | ListedKey) {
    return <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => { setEditor(kind === "channels" ? { kind, item: item as Channel } : { kind, item: item as ListedKey }); setMutationError(""); }}>{t("Edit", "编辑")}</Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => void mutate(`${kind}/${item.id}`, "PATCH", { status: item.status === 1 ? kind === "channels" ? 3 : 2 : 1 })}>{item.status === 1 ? t("Disable", "禁用") : t("Enable", "启用")}</Button>
      <Button size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={() => { if (window.confirm(t(`Delete “${item.name}”? This cannot be undone.`, `删除“${item.name}”？此操作无法撤销。`))) void mutate(`${kind}/${item.id}`, "DELETE"); }}>{t("Delete", "删除")}</Button>
    </div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[22px] font-semibold tracking-tight">{t("Relay administration", "中转管理")}</h1><p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{t("Manage upstream channels, access keys, and model routing. Changes apply to the live relay.", "管理上游渠道、访问密钥和模型路由。更改会应用到正在运行的中转服务。")}</p></div>
        <Button variant="outline" onClick={refresh} disabled={disabled}><RefreshCw className="size-4" />{t("Refresh", "刷新")}</Button>
      </div>
      <details className="rounded-md border border-border bg-card p-4" open={error ? true : undefined}>
        <summary className="cursor-pointer text-sm font-medium">{t("Admin access", "管理访问")}</summary>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const nextToken = String(new FormData(form).get("admin-token") ?? "").trim();
          setSnapshot(null); setEditor(null); setNewSecret(""); setMutationError(""); setNotice(""); resetRouting();
          setToken(nextToken); setRevision((value) => value + 1); form.reset();
        }}>
          <div className="min-w-0 flex-1"><Label htmlFor="admin-token">{t("Admin token (optional with an authorized session)", "管理令牌（已授权会话可留空）")}</Label><Input id="admin-token" name="admin-token" type="password" autoComplete="off" className="mt-2" disabled={busy} /></div>
          <Button type="submit" disabled={busy}>{t("Connect", "连接")}</Button>
        </form>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("The token is held only in memory for this page. Leave it blank to use your signed-in account. Refreshing the browser clears it.", "令牌仅保存在当前页面的内存中。留空可使用已登录账号，刷新浏览器会清除令牌。")}</p>
      </details>
      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-card p-4 text-sm"><p className="font-medium text-destructive">{error}</p><p className="mt-2 text-muted-foreground">{t("Check your admin access above, then connect again or refresh.", "请检查上方管理权限，然后重新连接或刷新。")}</p></div>}
      {mutationError && <p role="alert" className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">{mutationError}</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {newSecret && <section className="rounded-md border border-brand/30 bg-brand-muted p-5" aria-label={t("New API key", "新 API 密钥")}>
        <h2 className="text-sm font-semibold">{t("Save this key now", "请立即保存此密钥")}</h2><p className="mt-1 text-sm">{t("The full key is shown only after creation. Store it securely before dismissing.", "完整密钥仅在创建后展示，请在关闭前安全保存。")}</p>
        <code className="mt-3 block break-all rounded-sm bg-background p-3 text-sm select-all">{newSecret}</code>
        <div className="mt-3 flex gap-3"><Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(newSecret); setCopied(true); } catch { setMutationError(t("Clipboard access failed. Select and copy the key manually.", "无法访问剪贴板，请选中密钥手动复制。")); } }}><Copy className="size-4" />{copied ? t("Copied", "已复制") : t("Copy key", "复制密钥")}</Button><Button size="sm" variant="ghost" onClick={() => setNewSecret("")}>{t("Dismiss", "关闭")}</Button></div>
      </section>}
      {loading && <p role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t("Loading live relay data…", "正在加载实时中转数据…")}</p>}
      {snapshot && <Tabs defaultValue="overview" onValueChange={() => { setEditor(null); setMutationError(""); }}>
        <div className="overflow-x-auto"><TabsList aria-label={t("Administration sections", "管理栏目")}>
          <TabsTrigger value="overview">{t("Overview", "总览")}</TabsTrigger><TabsTrigger value="channels">{t("Channels", "渠道")}</TabsTrigger><TabsTrigger value="keys">{t("Keys", "密钥")}</TabsTrigger><TabsTrigger value="abilities">{t("Routing abilities", "路由能力")}</TabsTrigger>
        </TabsList></div>
        <TabsContent value="overview" className="space-y-8">
          <section><h2 className="mb-4 text-base font-semibold">{t("Live inventory and usage", "实时资源与用量")}</h2>
            <dl className="grid gap-x-8 gap-y-5 rounded-md border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-3">
              {[
                [t("Channels / enabled", "渠道总数 / 启用"), `${snapshot.overview.channels.total} / ${snapshot.overview.channels.enabled}`],
                [t("Automatically disabled channels", "自动禁用渠道"), snapshot.overview.channels.autoDisabled],
                [t("Keys / enabled", "密钥总数 / 启用"), `${snapshot.overview.keys.total} / ${snapshot.overview.keys.enabled}`],
                [t("Recorded requests", "已记录请求"), snapshot.overview.usage.total_requests],
                [t("Requests · last 24 hours", "最近 24 小时请求"), snapshot.overview.usage.requests_24h],
                [t("Usage · last 24 hours", "最近 24 小时用量"), usd(snapshot.overview.usage.usd_24h)],
              ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-medium tabular-nums">{value}</dd></div>)}
            </dl>
          </section>
          <section><h2 className="mb-3 text-base font-semibold">{t("Models by enabled group", "已启用分组的模型")}</h2>
            {Object.keys(snapshot.overview.groups).length ? <Table><TableHeader><TableRow><TableHead>{t("Group", "分组")}</TableHead><TableHead>{t("Models", "模型数量")}</TableHead></TableRow></TableHeader><TableBody>{Object.entries(snapshot.overview.groups).map(([name, count]) => <TableRow key={name}><TableCell>{name}</TableCell><TableCell className="tabular-nums">{count}</TableCell></TableRow>)}</TableBody></Table> : <Empty>{t("No enabled groups. Add or enable a channel to make models available.", "暂无启用的分组。添加或启用渠道后即可提供模型。")}</Empty>}
          </section>
          <section><h2 className="mb-3 text-base font-semibold">{t("Current relay settings", "当前中转设置")}</h2><dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">{t("Retries", "重试次数")}</dt><dd>{snapshot.overview.settings.retryTimes}</dd></div>
            <div><dt className="text-muted-foreground">{t("Request timeout", "请求超时")}</dt><dd>{snapshot.overview.settings.requestTimeoutMs} ms</dd></div>
            <div><dt className="text-muted-foreground">{t("Automatic disabling", "自动禁用")}</dt><dd>{snapshot.overview.settings.autoDisableEnabled ? t("Enabled", "已启用") : t("Disabled", "已禁用")}</dd></div>
            <div><dt className="text-muted-foreground">{t("Fallback model ratio", "默认模型倍率")}</dt><dd>{snapshot.overview.settings.fallbackModelRatio}</dd></div>
            {Object.entries(snapshot.overview.settings.groupRatio).map(([name, ratio]) => <div key={name}><dt className="text-muted-foreground">{t("Group ratio", "分组倍率")} · {name}</dt><dd>{ratio}</dd></div>)}
          </dl></section>
        </TabsContent>
        <TabsContent value="channels" className="space-y-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{t("Upstream channels", "上游渠道")}</h2><Button disabled={disabled} onClick={() => { setEditor({ kind: "channels" }); setMutationError(""); }}><Plus className="size-4" />{t("Add channel", "添加渠道")}</Button></div>
          {editor?.kind === "channels" && <ResourceEditor key={`channel-${editor.item?.id ?? "new"}`} editor={editor} busy={disabled} t={t} onCancel={() => setEditor(null)} onSave={(body) => mutate(editor.item ? `channels/${editor.item.id}` : "channels", editor.item ? "PATCH" : "POST", body)} />}
          <div className="rounded-md border border-border bg-card">
            {!snapshot.channels.length ? <Empty>{t("No channels configured. Add an upstream URL, API key, and model IDs to start routing.", "尚未配置渠道。添加上游地址、API 密钥和模型 ID 以启用路由。")}</Empty> : <Table><TableHeader><TableRow>{[t("Channel", "渠道"), t("Status", "状态"), t("Models / groups", "模型 / 分组"), t("Priority / weight", "优先级 / 权重"), t("Actions", "操作")].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}</TableRow></TableHeader><TableBody>{snapshot.channels.map((channel) => <TableRow key={channel.id}>
              <TableCell><p className="font-medium">{channel.name}</p><p className="mt-1 text-xs text-muted-foreground">#{channel.id} · {channel.type}</p><p className="mt-1 max-w-64 break-all whitespace-normal text-xs text-muted-foreground">{channel.baseUrl}</p></TableCell>
              <TableCell><Badge variant="outline">{status(channel.status, true)}</Badge></TableCell>
              <TableCell><p className="max-w-64 break-words whitespace-normal text-xs">{channel.models.join(", ")}</p><p className="mt-2 text-xs text-muted-foreground">{channel.groups.join(", ")}</p></TableCell>
              <TableCell className="tabular-nums">{channel.priority} / {channel.weight}</TableCell><TableCell>{actions("channels", channel)}</TableCell>
            </TableRow>)}</TableBody></Table>}
          </div>
        </TabsContent>
        <TabsContent value="keys" className="space-y-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{t("Relay API keys", "中转 API 密钥")}</h2><Button disabled={disabled} onClick={() => { setEditor({ kind: "keys" }); setMutationError(""); }}><Plus className="size-4" />{t("Create key", "创建密钥")}</Button></div>
          {editor?.kind === "keys" && <ResourceEditor key={`key-${editor.item?.id ?? "new"}`} editor={editor} busy={disabled} t={t} onCancel={() => setEditor(null)} onSave={(body) => mutate(editor.item ? `keys/${editor.item.id}` : "keys", editor.item ? "PATCH" : "POST", body)} />}
          <div className="rounded-md border border-border bg-card">
            {!snapshot.keys.length ? <Empty>{t("No API keys yet. Create a key to authorize relay requests.", "暂无 API 密钥。创建密钥以授权中转请求。")}</Empty> : <Table><TableHeader><TableRow>{[t("Key", "密钥"), t("Status / group", "状态 / 分组"), t("Remaining / used", "剩余 / 已用"), t("Actions", "操作")].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}</TableRow></TableHeader><TableBody>{snapshot.keys.map((key) => <TableRow key={key.id}>
              <TableCell><p className="font-medium">{key.name}</p><code className="mt-1 block text-xs text-muted-foreground">{key.key}</code></TableCell><TableCell><Badge variant="outline">{status(key.status, false)}</Badge><p className="mt-2 text-xs text-muted-foreground">{key.group || "default"}</p></TableCell>
              <TableCell className="tabular-nums"><p>{key.unlimitedQuota ? t("Unlimited", "不限额") : usd(key.remain_usd ?? key.remainQuota / 500_000)}</p><p className="mt-1 text-xs text-muted-foreground">{usd(key.used_usd)} {t("used", "已用")}</p></TableCell><TableCell>{actions("keys", key)}</TableCell>
            </TableRow>)}</TableBody></Table>}
          </div>
        </TabsContent>
        <TabsContent value="abilities" className="space-y-5">
          <div><h2 className="text-base font-semibold">{t("Routing abilities", "路由能力")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("Abilities follow channel configuration. Select a group and model to inspect priority layers and selection shares.", "能力表随渠道配置变化。选择分组和模型可查看优先级分层与选择占比。")}</p></div>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field name="ability-group" title={t("Group", "分组")}><select id="ability-group" value={group} onChange={(event) => { setGroup(event.target.value); setModel(""); resetRouting(); }} className="h-9 min-w-0 rounded-sm border border-input bg-background px-3 text-sm"><option value="">{t("All groups", "全部分组")}</option>{groups.map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field name="ability-model" title={t("Model", "模型")}><select id="ability-model" value={model} onChange={(event) => { setModel(event.target.value); resetRouting(); }} className="h-9 min-w-0 rounded-sm border border-input bg-background px-3 text-sm"><option value="">{t("All models", "全部模型")}</option>{models.map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Button variant="outline" disabled={!group || !model || routeLoading || disabled} onClick={() => void inspectRouting()}>{routeLoading && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}{t("Inspect route", "查看路由")}</Button>
          </div>
          {routeError && <p role="alert" className="text-sm text-destructive">{routeError}</p>}
          {routing && <section className="rounded-md border border-border bg-card p-4"><h3 className="text-sm font-semibold">{routing.group} / {routing.model}</h3>{routing.layers.length ? <ol className="mt-3 space-y-3">{routing.layers.map((layer) => <li key={layer.priority}><p className="text-xs font-medium">{t("Priority", "优先级")} {layer.priority}</p><ul className="mt-1 space-y-1 text-sm text-muted-foreground">{layer.channels.map((channel) => <li key={channel.id}>{channel.name} · {t("weight", "权重")} {channel.weight} · {(channel.share * 100).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: 2 })}%</li>)}</ul></li>)}</ol> : <Empty>{t("No enabled channel can serve this route.", "没有已启用的渠道可以服务此路由。")}</Empty>}</section>}
          <div className="rounded-md border border-border bg-card">{!abilities.length ? <Empty>{t("No matching abilities. Configure channel models and groups, or change your filters.", "暂无匹配能力。请配置渠道模型和分组，或调整筛选条件。")}</Empty> : <Table><TableHeader><TableRow>{[t("Group", "分组"), t("Model", "模型"), t("Channel", "渠道"), t("Status", "状态"), t("Priority / weight", "优先级 / 权重")].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}</TableRow></TableHeader><TableBody>{abilities.map((ability) => <TableRow key={`${ability.group}:${ability.model}:${ability.channelId}`}><TableCell>{ability.group}</TableCell><TableCell>{ability.model}</TableCell><TableCell>{snapshot.channels.find((channel) => channel.id === ability.channelId)?.name ?? `#${ability.channelId}`}</TableCell><TableCell>{ability.enabled ? t("Enabled", "已启用") : t("Disabled", "已禁用")}</TableCell><TableCell className="tabular-nums">{ability.priority} / {ability.weight}</TableCell></TableRow>)}</TableBody></Table>}</div>
        </TabsContent>
      </Tabs>}
    </div>
  );
}
