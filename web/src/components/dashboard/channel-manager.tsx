"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, TerminalSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChannelEditorPanel, type ChannelDetection, type ChannelDiscoveryRequest, type ChannelSubmit } from "@/components/dashboard/channel-editor";
import type { ChannelDraft } from "@/lib/relay/channel-draft";
import { isSupportedChannelType } from "@/lib/relay/types";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  workspaceId: string;
  canManage: boolean;
  allowPlatformChannels: boolean;
  locale: Locale;
  channels: ChannelDraft[];
  platformModels: string[];
};

type CodexQuota = {
  plan?: string;
  windows?: { name?: string; used_percent?: number; reset_at?: number; reset_after_seconds?: number }[];
  reset_credits?: number;
};

function formatCodexReset(timestamp: number | undefined, locale: Locale) {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { dateStyle: "short", timeStyle: "short" });
}

function formatCodexResetAfter(seconds: number | undefined, locale: Locale) {
  if (!seconds || seconds < 0) return "";
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (locale === "zh") return minutes >= 60 ? `${Math.ceil(minutes / 60)} 小时后` : `${minutes} 分钟后`;
  return minutes >= 60 ? `in ${Math.ceil(minutes / 60)} hr` : `in ${minutes} min`;
}

export function ChannelManager({ workspaceId, canManage, allowPlatformChannels, locale, channels, platformModels }: Props) {
  const d = getDictionary(locale).dashboard.components.channels;
  const editor = getDictionary(locale).dashboard.components.channelEditor;
  const t = getDictionary(locale).dashboard.workspace.channels;
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(allowPlatformChannels);
  const [error, setError] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ChannelDraft | null>(null);
  const [codexOpen, setCodexOpen] = React.useState(false);
  const [codexAuth, setCodexAuth] = React.useState("");
  const [codexName, setCodexName] = React.useState("");
  const [codexPriority, setCodexPriority] = React.useState("0");
  const [codexWeight, setCodexWeight] = React.useState("1");
  const [codexBusy, setCodexBusy] = React.useState(false);
  const [codexError, setCodexError] = React.useState("");
  const [codexNotice, setCodexNotice] = React.useState("");
  const [quota, setQuota] = React.useState<Record<string, CodexQuota>>({});
  const [quotaLoading, setQuotaLoading] = React.useState("");

  async function request(path: string, method: string, body?: unknown) {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.ok) return;
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload?.error === "string" ? payload.error : payload?.error?.message || d.updateError);
  }

  async function updateDefaultChannel(next: boolean) {
    setError("");
    setEnabled(next);
    try {
      await request(`/api/workspaces/${workspaceId}`, "PATCH", { allowPlatformChannels: next });
    } catch (cause) {
      setEnabled(!next);
      setError(cause instanceof Error ? cause.message : d.updateError);
    }
  }

  const endpoint = `/api/workspaces/${workspaceId}/channels`;
  const importCodex = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (codexBusy) return;
    setCodexBusy(true); setCodexError(""); setCodexNotice("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/chatgpt-subscription`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth_json: codexAuth, name: codexName.trim(), priority: Number(codexPriority) || 0, weight: Math.max(1, Number(codexWeight) || 1) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || payload?.error || t.codexImportError);
      setCodexNotice(t.codexImported); setCodexAuth(""); setCodexName(""); setCodexOpen(false); router.refresh();
    } catch (cause) { setCodexError(cause instanceof Error ? cause.message : t.codexImportError); }
    finally { setCodexBusy(false); }
  };
  const refreshQuota = async (channel: ChannelDraft) => {
    setError("");
    setQuotaLoading(channel.id);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/chatgpt-subscription/${channel.id}/quota`, { credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(t.codexQuotaError);
      setQuota((current) => ({ ...current, [channel.id]: payload }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.codexQuotaError); }
    finally { setQuotaLoading(""); }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium">{d.defaultTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{d.defaultDescription}</p>
          </div>
          {canManage && (
            <Switch
              checked={enabled}
              onCheckedChange={(next) => void updateDefaultChannel(next)}
              aria-label={d.enable}
            />
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{enabled ? d.enabled : d.disabled}</p>
        {platformModels.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">{d.availableModels}</p>
            <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{platformModels.join(", ")}</p>
          </div>
        )}
      </section>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-medium">{t.myChannels}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.myChannelsDescription}</p>
          </div>
          {canManage && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => { setCodexError(""); setCodexNotice(""); setCodexOpen(true); }}><TerminalSquare className="size-4" />{t.importCodex}</Button>
              <Button variant="brand" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4" />{editor.addTitle}</Button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t.name}</th>
                <th>{t.upstream}</th>
                <th>{t.models}</th>
                <th>{t.status}</th>
                {canManage && <th className="text-right">{t.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.id}>
                  <td className="font-medium">
                    {channel.name}
                    {channel.type === "chatgpt-subscription" && <span className="badge badge-info badge-sm ml-2">Codex</span>}
                    {channel.tag && <span className="badge badge-outline badge-sm ml-2 font-mono text-[10px]">{channel.tag}</span>}
                  </td>
                  <td className="max-w-64 truncate font-mono text-xs">{channel.baseUrl}</td>
                  <td className="text-xs">{channel.models.length ? channel.models.join(", ") : "—"}</td>
                  <td>
                    <div className="flex min-w-32 flex-col items-start gap-2">
                      <span className={cn("badge badge-outline", channel.status === 1 ? "badge-success" : channel.status === 2 ? "badge-warning" : "")}>
                        {channel.status === 1 ? t.enabled : channel.status === 2 ? t.autoDisabled : t.disabled}
                      </span>
                      {channel.type === "chatgpt-subscription" && (
                        <div className="flex max-w-72 flex-wrap items-center gap-2">
                          <button type="button" className="btn btn-xs btn-ghost whitespace-nowrap" disabled={quotaLoading !== ""} onClick={() => void refreshQuota(channel)} aria-label={t.codexQuotaRefresh} title={t.codexQuotaRefresh}>
                            {quotaLoading === channel.id ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                            {quotaLoading === channel.id ? t.codexQuotaLoading : t.codexQuotaRefresh}
                          </button>
                          {quota[channel.id] && (
                            <div className="min-w-0 text-xs leading-5 text-muted-foreground">
                              <span className="block">{t.codexQuota}{quota[channel.id].plan ? ` · ${t.codexPlan}: ${quota[channel.id].plan}` : ""}</span>
                              <span className="block break-words">
                                {quota[channel.id].windows?.map((window) => {
                                  const reset = formatCodexReset(window.reset_at, locale) || formatCodexResetAfter(window.reset_after_seconds, locale);
                                  return `${window.name ?? "window"} ${window.used_percent ?? 0}%${reset ? ` · ${t.codexResetAt} ${reset}` : ""}`;
                                }).join(" · ") || "—"}
                                {quota[channel.id].reset_credits !== undefined ? ` · ${quota[channel.id].reset_credits} ${t.codexResetCredits}` : ""}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  {canManage && (
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {channel.type === "chatgpt-subscription" ? <span className="text-xs text-muted-foreground">Codex</span> : isSupportedChannelType(channel.type) ? <button type="button" className="btn btn-xs btn-ghost" onClick={() => { setEditing(channel); setOpen(true); }}>{editor.editTitle}</button> : <span className="text-xs text-muted-foreground">ChatGPT</span>}
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          onClick={async () => {
                            setError("");
                            try {
                              await request(endpoint, "PATCH", { id: channel.id, status: channel.status === 1 ? 3 : 1 });
                              router.refresh();
                            } catch (cause) {
                              setError(cause instanceof Error ? cause.message : d.updateError);
                            }
                          }}
                        >
                          {channel.status === 1 ? editor.disableChannel : editor.enableChannel}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!channels.length && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="py-10 text-center text-sm text-muted-foreground">{t.empty}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ChannelEditorPanel
        open={open}
        onOpenChange={setOpen}
        locale={locale}
        initial={editing}
        onSubmit={async (payload: ChannelSubmit) => {
          await request(endpoint, editing ? "PATCH" : "POST", editing ? { id: editing.id, ...payload } : payload);
          router.refresh();
        }}
        discover={async (input: ChannelDiscoveryRequest) => {
          const response = await fetch(`${endpoint}/models`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : payload?.error?.message || d.updateError);
          return payload.data as string[];
        }}
        detect={async (input: ChannelDiscoveryRequest & { model?: string }) => {
          const response = await fetch(`${endpoint}/detect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : payload?.error?.message || d.updateError);
          return payload.data as ChannelDetection[];
        }}
        onDeleted={async () => {
          await request(`${endpoint}?id=${editing?.id}`, "DELETE");
          router.refresh();
        }}
      />
      <Dialog open={codexOpen} onOpenChange={(next) => { if (!codexBusy) setCodexOpen(next); }}>
        <DialogContent className="max-w-2xl" closeLabel={t.cancel}>
          <DialogHeader><DialogTitle>{t.importCodex}</DialogTitle><DialogDescription>{t.importCodexDescription}</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={importCodex}>
            <div className="space-y-2"><Label htmlFor="codex-auth-json">{t.codexAuthJson}</Label><Textarea id="codex-auth-json" required rows={8} value={codexAuth} onChange={(event) => setCodexAuth(event.target.value)} disabled={codexBusy} spellCheck={false} /><p className="text-xs leading-relaxed text-muted-foreground">{t.codexAuthHint}</p></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="codex-name">{t.codexName}</Label><Input id="codex-name" value={codexName} placeholder={t.codexNamePlaceholder} onChange={(event) => setCodexName(event.target.value)} disabled={codexBusy} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="codex-priority">{t.codexPriority}</Label><Input id="codex-priority" type="number" step="1" value={codexPriority} onChange={(event) => setCodexPriority(event.target.value)} disabled={codexBusy} /></div><div className="space-y-2"><Label htmlFor="codex-weight">{t.codexWeight}</Label><Input id="codex-weight" type="number" min="1" step="1" value={codexWeight} onChange={(event) => setCodexWeight(event.target.value)} disabled={codexBusy} /></div></div></div>
            {codexError && <p role="alert" className="text-sm text-destructive">{codexError}</p>}
            {codexNotice && <p role="status" className="text-sm text-muted-foreground">{codexNotice}</p>}
            <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="ghost" disabled={codexBusy} onClick={() => setCodexOpen(false)}>{t.cancel}</Button><Button type="submit" disabled={codexBusy || !codexAuth.trim()}>{codexBusy ? <><Loader2 className="size-4 animate-spin" />{t.importing}</> : t.import}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      {codexNotice && <p role="status" className="text-sm text-success">{codexNotice}</p>}
    </div>
  );
}
