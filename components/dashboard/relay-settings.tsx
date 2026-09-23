"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Locale } from "@/lib/i18n/config";
import type { Channel } from "@/lib/relay/types";

type Settings = {
  retryTimes: number;
  requestTimeoutMs: number;
  autoDisableEnabled: boolean;
  fallbackModelRatio: number;
  jevChannelId: number | null;
};
type Draft = Omit<Settings, "retryTimes" | "requestTimeoutMs" | "fallbackModelRatio" | "jevChannelId"> & {
  retryTimes: string;
  requestTimeoutMs: string;
  fallbackModelRatio: string;
  jevChannelId: string;
};

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, { cache: "no-store", credentials: "same-origin", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : body?.error?.message || `HTTP ${response.status}`);
  if (body === null) throw new Error("The server returned an invalid response.");
  return body as T;
}

export function RelaySettings({ locale }: { locale: Locale }) {
  const t = (en: string, zh: string) => locale === "zh" ? zh : en;
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [channels, setChannels] = React.useState<Channel[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [settings, listing] = await Promise.all([
          adminRequest<Settings>("settings", { signal: controller.signal }),
          adminRequest<{ data: Channel[] }>("channels", { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setDraft({
          retryTimes: String(settings.retryTimes),
          requestTimeoutMs: String(settings.requestTimeoutMs),
          autoDisableEnabled: settings.autoDisableEnabled,
          fallbackModelRatio: String(settings.fallbackModelRatio),
          jevChannelId: settings.jevChannelId === null ? "" : String(settings.jevChannelId),
        });
        setChannels(listing.data.filter((channel) => channel.ownerType === "platform" && channel.status === 1 && channel.models.includes("typesafe-ai/jev")));
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const settings = await adminRequest<Settings>("settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retryTimes: Number(draft.retryTimes),
          requestTimeoutMs: Number(draft.requestTimeoutMs),
          autoDisableEnabled: draft.autoDisableEnabled,
          fallbackModelRatio: Number(draft.fallbackModelRatio),
          jevChannelId: draft.jevChannelId === "" ? null : Number(draft.jevChannelId),
        }),
      });
      setDraft({
        retryTimes: String(settings.retryTimes),
        requestTimeoutMs: String(settings.requestTimeoutMs),
        autoDisableEnabled: settings.autoDisableEnabled,
        fallbackModelRatio: String(settings.fallbackModelRatio),
        jevChannelId: settings.jevChannelId === null ? "" : String(settings.jevChannelId),
      });
      setNotice(t("Relay settings saved.", "中转设置已保存。"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  const disabled = loading || saving;
  const selectedUnavailable = draft?.jevChannelId && !channels.some((channel) => String(channel.id) === draft.jevChannelId);

  return <div className="flex flex-col gap-6">
    <div><h1 className="text-[22px] font-semibold tracking-tight">{t("Relay settings", "中转设置")}</h1><p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{t("Configure routing behavior and the platform channel used for JEV evaluations.", "配置中转路由行为及 JEV 评估使用的平台渠道。")}</p></div>
    {error && <p role="alert" className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {loading && <p role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t("Loading relay settings…", "正在加载中转设置…")}</p>}
    {draft && <form onSubmit={save} className="max-w-2xl space-y-6 rounded-md border border-border bg-card p-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="relay-retries">{t("Retries", "重试次数")}</Label><Input id="relay-retries" type="number" min="0" max="10" step="1" required disabled={disabled} value={draft.retryTimes} onChange={(event) => setDraft({ ...draft, retryTimes: event.target.value })} /><p className="text-xs text-muted-foreground">{t("0–10 additional attempts.", "可设置 0–10 次额外尝试。")}</p></div>
        <div className="space-y-2"><Label htmlFor="relay-timeout">{t("Request timeout (ms)", "请求超时（毫秒）")}</Label><Input id="relay-timeout" type="number" min="1000" max="600000" step="1" required disabled={disabled} value={draft.requestTimeoutMs} onChange={(event) => setDraft({ ...draft, requestTimeoutMs: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="relay-ratio">{t("Fallback model ratio", "默认模型倍率")}</Label><Input id="relay-ratio" type="number" min="0" max="1000" step="any" required disabled={disabled} value={draft.fallbackModelRatio} onChange={(event) => setDraft({ ...draft, fallbackModelRatio: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="relay-jev-channel">{t("JEV platform channel", "JEV 平台渠道")}</Label><select id="relay-jev-channel" className="select w-full" disabled={disabled} value={draft.jevChannelId} onChange={(event) => setDraft({ ...draft, jevChannelId: event.target.value })}><option value="">{t("Automatic selection", "自动选择")}</option>{selectedUnavailable && <option value={draft.jevChannelId} disabled>{t(`Unavailable channel #${draft.jevChannelId}`, `不可用渠道 #${draft.jevChannelId}`)}</option>}{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name} (#{channel.id})</option>)}</select><p className="text-xs text-muted-foreground">{t("Only enabled platform channels supporting typesafe-ai/jev are shown. Automatic selection uses the existing routing behavior.", "仅显示已启用且支持 typesafe-ai/jev 的平台渠道。自动选择沿用现有路由行为。")}</p></div>
      </div>
      <div className="flex items-center gap-3"><Switch id="relay-auto-disable" checked={draft.autoDisableEnabled} disabled={disabled} onCheckedChange={(checked) => setDraft({ ...draft, autoDisableEnabled: checked })} /><Label htmlFor="relay-auto-disable">{t("Automatically disable failing channels", "自动禁用故障渠道")}</Label></div>
      <Button type="submit" disabled={disabled}>{saving ? t("Saving…", "正在保存…") : t("Save settings", "保存设置")}</Button>
    </form>}
  </div>;
}
