"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard, Eye, EyeOff } from "lucide-react";
import { getDictionary, interpolate } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import type { ApiKey } from "@/lib/relay/types";
import { formatQuota, quotaToCurrency, type Currency } from "@/lib/relay/currency";
import type { KeyGroupOption } from "@/components/dashboard/workspace-key-manager";

/** Scopes the relay enforces for workspace keys. */
const KEY_SCOPES = ["llm.chat", "llm.systemone", "image.generate", "video.generate", "files.write", "billing.read"] as const;
type KeyDraft = { name: string; group: string; scopes: string[]; budget: string };

function dateTime(value: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function statusOf(key: ApiKey): "active" | "expired" | "revoked" {
  if (key.status !== 1) return key.status === 3 ? "expired" : "revoked";
  return key.expiredTime !== -1 && key.expiredTime > 0 && Date.now() > key.expiredTime ? "expired" : "active";
}

export function WorkspaceKeyTable({ workspaceId, keys, groups, canManage, locale, currency }: { workspaceId: string; keys: ApiKey[]; groups: KeyGroupOption[]; canManage: boolean; locale: Locale; currency: Currency }) {
  const d = getDictionary(locale).dashboard.workspace.keys;
  const router = useRouter();
  const columns = canManage ? 7 : 6;
  const [editing, setEditing] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  const mutate = async (id: string, init: RequestInit, fallbackError: string, onSuccess?: (data: Record<string, unknown>) => void) => {
    setError(null);
    setBusy(id);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/keys${init.method === "DELETE" ? `?id=${id}` : ""}`, init);
      const data = await response.json();
      if (!response.ok) {
        setError({ id, message: typeof data.error === "string" ? data.error : data.error?.message || fallbackError });
        return;
      }
      onSuccess?.(data);
      router.refresh();
    } catch {
      setError({ id, message: fallbackError });
    } finally {
      setBusy(null);
    }
  };

  const rotate = (id: string) => {
    if (!confirm(d.rotateConfirm)) return;
    void mutate(id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "rotate" }) }, d.rotateError, (data) => setSecret({ id, value: String(data.secret) }));
  };

  const revoke = (id: string) => {
    if (!confirm(d.revokeConfirm)) return;
    void mutate(id, { method: "DELETE" }, d.revokeError, () => { if (editing === id) setEditing(null); });
  };

  const save = (id: string, values: KeyDraft) => {
    void mutate(id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "edit", name: values.name, group: values.group, scopes: values.scopes.join(","), budget: values.budget }),
    }, d.editError, () => setEditing(null));
  };

  const copyKey = async (key: ApiKey) => {
    if (!key.secret) return;
    await navigator.clipboard.writeText(key.secret);
    setCopied(key.id);
    window.setTimeout(() => setCopied((current) => current === key.id ? null : current), 1800);
  };

  return <><section className="overflow-x-auto rounded-lg border border-border bg-card">
    <table className="w-full border-collapse text-sm">
      <thead><tr className="border-b border-border bg-muted/40"><th className="h-10 px-4 py-2 text-left font-medium text-muted-foreground">{d.name}</th><th className="h-10 px-4 py-2 text-left font-medium text-muted-foreground">{d.key}</th><th className="h-10 px-4 py-2 text-left font-medium text-muted-foreground">{d.permissions}</th><th className="h-10 px-4 py-2 text-left font-medium text-muted-foreground">{d.budgetColumn}</th><th className="h-10 px-4 py-2 text-left font-medium text-muted-foreground">{d.lastUsed}</th><th className="h-10 px-4 py-2 text-left font-medium text-muted-foreground">{d.status}</th>{canManage && <th className="h-10 px-4 py-2" aria-label={d.actions} />}</tr></thead>
      <tbody className="divide-y divide-border">
        {keys.map((key) => {
          const state = statusOf(key);
          const limit = key.budgetLimitQuota;
          return <Fragment key={key.id}>
            <tr>
              <td className="whitespace-nowrap px-4 py-3">
                <div className="font-medium">{key.name || interpolate(d.fallbackName, { id: key.id })}</div>
                <div className="text-xs text-foreground/60">{d.group}: {key.group || d.groupDefault}</div>
              </td>
              <td className="min-w-64 px-4 py-3">
                <div className="flex items-center gap-1">
                  <code className="min-w-0 whitespace-nowrap text-xs">{revealed === key.id && key.secret ? key.secret : key.key}</code>
                  {key.secret && <div className="flex shrink-0 gap-1">
                    <button type="button" className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-7 px-2 text-xs bg-transparent gap-1 whitespace-nowrap" aria-label={revealed === key.id ? d.hideSecret : d.showSecret} aria-pressed={revealed === key.id} onClick={() => setRevealed(revealed === key.id ? null : key.id)}>
                      {revealed === key.id ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{revealed === key.id ? d.hideSecret : d.showSecret}
                    </button>
                    <button type="button" className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-7 px-2 text-xs bg-transparent gap-1 whitespace-nowrap" aria-label={copied === key.id ? d.copied : d.copy} onClick={() => void copyKey(key)}>
                      {copied === key.id ? <Check className="size-3.5 text-success" /> : <Clipboard className="size-3.5" />}{copied === key.id ? d.copied : d.copy}
                    </button>
                  </div>}
                </div>
              </td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{(key.scopes ?? []).map((scope) => <span className="inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium border-border bg-transparent text-[11px] whitespace-nowrap" key={scope}>{d.scopeLabels[scope as keyof typeof d.scopeLabels] ?? scope}</span>)}</div></td>
              <td className="min-w-32 px-4 py-3">
                <div className="text-xs">{d.spent} {formatQuota(key.budgetSpentQuota, currency, 4)}{limit !== null && ` / ${formatQuota(limit, currency, 4)}`}</div>
                {limit !== null && <progress className="h-2 w-full rounded-full accent-brand w-24" value={Math.min(100, key.budgetSpentQuota / limit * 100)} max={100} />}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <div className="text-xs">{key.accessedTime ? dateTime(key.accessedTime, locale) : d.never}</div>
                <a className="underline hover:no-underline text-xs" href={localeHref(locale, `/dashboard/w/${workspaceId}/logs?keyId=${key.id}`)}>{d.usage}</a>
              </td>
              <td className="px-4 py-3"><span className={`inline-flex items-center whitespace-nowrap rounded-sm border px-2 py-0.5 text-[11px] ${state === "active" ? "border-success/20 bg-success/10 text-success" : "border-border bg-transparent"}`}>{d[state]}</span></td>
              {canManage && <td className="px-4 py-3 text-right">
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-1">
                    <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-7 px-2 text-xs border-transparent bg-transparent" disabled={busy !== null} onClick={() => { setEditing(editing === key.id ? null : key.id); setError(null); }}>{editing === key.id ? d.cancel : d.edit}</button>
                    {key.status === 1 && <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-7 px-2 text-xs border-transparent bg-transparent" disabled={busy !== null} onClick={() => rotate(key.id)}>{busy === key.id ? <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent size-3" /> : d.rotate}</button>}
                    {key.status === 1 && <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-7 px-2 text-xs border-transparent bg-transparent text-error" disabled={busy !== null} onClick={() => revoke(key.id)}>{d.revoke}</button>}
                  </div>
                  {error?.id === key.id && <p className="text-xs text-error">{error.message}</p>}
                </div>
              </td>}
            </tr>
            {editing === key.id && <tr><td colSpan={columns} className="bg-muted/50">
              <KeyEditForm name={key.name} group={key.group} scopes={key.scopes ?? []} budgetLimitQuota={key.budgetLimitQuota} groups={groups} locale={locale} currency={currency} busy={busy === key.id} onSave={(values) => save(key.id, values)} onCancel={() => setEditing(null)} />
            </td></tr>}
          </Fragment>;
        })}
        {keys.length === 0 && <tr><td className="py-8 text-center text-foreground/60" colSpan={columns}>{d.empty}</td></tr>}
      </tbody>
    </table>
  </section>{secret && <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl" role="status" aria-live="polite"><KeySecret secret={secret.value} locale={locale} onDismiss={() => setSecret(null)} /></div>}</>;
}

function KeySecret({ secret, locale, onDismiss }: { secret: string; locale: Locale; onDismiss: () => void }) {
  const d = getDictionary(locale).dashboard.workspace.keys;
  const [copied, setCopied] = useState(false);
  return <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm border-success/30 bg-success/5 text-success w-80 p-2 text-xs">
    <div className="min-w-0 flex-1">
      <code className="block break-all">{secret}</code>
      <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-7 px-2 text-xs mt-2" onClick={async () => { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? d.copied : d.copy}</button>
    </div>
    <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-7 px-2 text-xs border-transparent bg-transparent" onClick={onDismiss}>{d.done}</button>
  </div>;
}

function KeyEditForm({ name, group, scopes, budgetLimitQuota, groups, locale, currency, busy, onSave, onCancel }: { name: string; group: string; scopes: string[]; budgetLimitQuota: number | null; groups: KeyGroupOption[]; locale: Locale; currency: Currency; busy: boolean; onSave: (values: KeyDraft) => void; onCancel: () => void }) {
  const d = getDictionary(locale).dashboard.workspace.keys;
  const [draft, setDraft] = useState<KeyDraft>({ name, group, scopes, budget: budgetLimitQuota === null ? "" : quotaToCurrency(budgetLimitQuota, currency).toFixed(2) });
  return <form className="grid gap-4 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
    <label className="flex flex-col"><span className="text-sm text-muted-foreground mb-1">{d.name}</span><input className="h-9 w-full rounded-sm border border-input bg-transparent px-3 py-1 text-sm h-8" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={d.namePlaceholder} required /></label>
    <label className="flex flex-col"><span className="text-sm text-muted-foreground mb-1">{d.group}</span><select className="h-9 w-full rounded-sm border border-input bg-background px-3 text-sm h-8" value={draft.group} onChange={(event) => setDraft({ ...draft, group: event.target.value })}><option value="">{d.groupDefault}</option>{groups.map((option) => <option key={option.name} value={option.name}>{option.displayName || option.name}</option>)}</select></label>
    <label className="flex flex-col"><span className="text-sm text-muted-foreground mb-1">{d.budget} ({currency.code})</span><input className="h-9 w-full rounded-sm border border-input bg-transparent px-3 py-1 text-sm h-8" inputMode="decimal" value={draft.budget} onChange={(event) => setDraft({ ...draft, budget: event.target.value })} placeholder={d.noLimit} /></label>
    <fieldset className="md:col-span-3">
      <legend className="text-sm text-muted-foreground mb-2">{d.permissions}</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{KEY_SCOPES.map((scope) => <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2" key={scope}><input className="size-4 accent-brand size-3.5" type="checkbox" checked={draft.scopes.includes(scope)} onChange={(event) => setDraft({ ...draft, scopes: event.target.checked ? [...draft.scopes, scope] : draft.scopes.filter((item) => item !== scope) })} /><span>{d.scopeLabels[scope]}</span></label>)}</div>
    </fieldset>
    <div className="flex gap-2 md:col-span-3">
      <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-8 px-3" disabled={busy || !draft.name.trim() || draft.scopes.length === 0}>{busy ? <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent size-3" /> : d.save}</button>
      <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-8 px-3 border-transparent bg-transparent" type="button" onClick={onCancel}>{d.cancel}</button>
    </div>
  </form>;
}
