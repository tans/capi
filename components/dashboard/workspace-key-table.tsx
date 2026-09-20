"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { getDictionary, interpolate } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import type { ApiKey } from "@/lib/relay/types";
import type { KeyGroupOption } from "@/components/dashboard/workspace-key-manager";

/** Scopes the relay enforces for workspace keys. */
const KEY_SCOPES = ["llm.chat", "llm.evaluate", "image.generate", "video.generate", "billing.read"] as const;
const QUOTA_PER_USD = 500_000;

type KeyDraft = { name: string; group: string; scopes: string[]; budget: string };

function money(quota: number): string {
  return `$${(quota / QUOTA_PER_USD).toFixed(4)}`;
}

function dateTime(value: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function statusOf(key: ApiKey): "active" | "expired" | "revoked" {
  if (key.status !== 1) return key.status === 3 ? "expired" : "revoked";
  return key.expiredTime !== -1 && key.expiredTime > 0 && Date.now() > key.expiredTime ? "expired" : "active";
}

export function WorkspaceKeyTable({ workspaceId, keys, groups, canManage, locale }: { workspaceId: number; keys: ApiKey[]; groups: KeyGroupOption[]; canManage: boolean; locale: Locale }) {
  const d = getDictionary(locale).dashboard.workspace.keys;
  const router = useRouter();
  const columns = canManage ? 7 : 6;
  const [editing, setEditing] = useState<number | null>(null);
  const [secret, setSecret] = useState<{ id: number; value: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<{ id: number; message: string } | null>(null);

  const mutate = async (id: number, init: RequestInit, fallbackError: string, onSuccess?: (data: Record<string, unknown>) => void) => {
    setError(null);
    setBusy(id);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/keys${init.method === "DELETE" ? `?id=${id}` : ""}`, init);
      const data = await response.json();
      if (!response.ok) {
        setError({ id, message: data.error || fallbackError });
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

  const rotate = (id: number) => {
    if (!confirm(d.rotateConfirm)) return;
    void mutate(id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "rotate" }) }, d.rotateError, (data) => setSecret({ id, value: String(data.secret) }));
  };

  const revoke = (id: number) => {
    if (!confirm(d.revokeConfirm)) return;
    void mutate(id, { method: "DELETE" }, d.revokeError, () => { if (editing === id) setEditing(null); });
  };

  const save = (id: number, values: KeyDraft) => {
    void mutate(id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "edit", name: values.name, group: values.group, scopes: values.scopes.join(","), budget: values.budget }),
    }, d.editError, () => setEditing(null));
  };

  return <section className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
    <table className="table">
      <thead><tr><th>{d.name}</th><th>{d.key}</th><th>{d.permissions}</th><th>{d.budgetColumn}</th><th>{d.lastUsed}</th><th>{d.status}</th>{canManage && <th aria-label={d.actions} />}</tr></thead>
      <tbody>
        {keys.map((key) => {
          const state = statusOf(key);
          const limit = key.budgetLimitQuota;
          return <Fragment key={key.id}>
            <tr>
              <td className="whitespace-nowrap">
                <div className="font-medium">{key.name || interpolate(d.fallbackName, { id: key.id })}</div>
                <div className="text-xs text-base-content/60">{d.group}: {key.group || d.groupDefault}</div>
              </td>
              <td className="whitespace-nowrap"><code className="text-xs">{key.key}</code></td>
              <td><div className="flex flex-wrap gap-1">{(key.scopes ?? []).map((scope) => <span className="badge badge-ghost badge-sm whitespace-nowrap" key={scope}>{d.scopeLabels[scope as keyof typeof d.scopeLabels] ?? scope}</span>)}</div></td>
              <td className="min-w-32">
                <div className="text-xs">{d.spent} {money(key.budgetSpentQuota)}{limit !== null && ` / ${money(limit)}`}</div>
                {limit !== null && <progress className="progress progress-primary w-24" value={Math.min(100, key.budgetSpentQuota / limit * 100)} max={100} />}
              </td>
              <td className="whitespace-nowrap">
                <div className="text-xs">{key.accessedTime ? dateTime(key.accessedTime, locale) : d.never}</div>
                <a className="link link-hover text-xs" href={localeHref(locale, `/dashboard/w/${workspaceId}/logs?keyId=${key.id}`)}>{d.usage}</a>
              </td>
              <td><span className={`badge badge-sm whitespace-nowrap ${state === "active" ? "badge-success" : "badge-ghost"}`}>{d[state]}</span></td>
              {canManage && <td className="text-right">
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-1">
                    <button className="btn btn-xs btn-ghost" disabled={busy !== null} onClick={() => { setEditing(editing === key.id ? null : key.id); setError(null); }}>{editing === key.id ? d.cancel : d.edit}</button>
                    {key.status === 1 && <button className="btn btn-xs btn-ghost" disabled={busy !== null} onClick={() => rotate(key.id)}>{busy === key.id ? <span className="loading loading-spinner loading-xs" /> : d.rotate}</button>}
                    {key.status === 1 && <button className="btn btn-xs btn-ghost text-error" disabled={busy !== null} onClick={() => revoke(key.id)}>{d.revoke}</button>}
                  </div>
                  {error?.id === key.id && <p className="text-xs text-error">{error.message}</p>}
                  {secret?.id === key.id && <KeySecret secret={secret.value} locale={locale} onDismiss={() => setSecret(null)} />}
                </div>
              </td>}
            </tr>
            {editing === key.id && <tr><td colSpan={columns} className="bg-base-200/50">
              <KeyEditForm name={key.name} group={key.group} scopes={key.scopes ?? []} budgetLimitQuota={key.budgetLimitQuota} groups={groups} locale={locale} busy={busy === key.id} onSave={(values) => save(key.id, values)} onCancel={() => setEditing(null)} />
            </td></tr>}
          </Fragment>;
        })}
        {keys.length === 0 && <tr><td className="py-8 text-center text-base-content/60" colSpan={columns}>{d.empty}</td></tr>}
      </tbody>
    </table>
  </section>;
}

function KeySecret({ secret, locale, onDismiss }: { secret: string; locale: Locale; onDismiss: () => void }) {
  const d = getDictionary(locale).dashboard.workspace.keys;
  const [copied, setCopied] = useState(false);
  return <div className="alert alert-success w-80 items-start p-2 text-xs">
    <div className="min-w-0 flex-1">
      <code className="block break-all">{secret}</code>
      <button className="btn btn-xs mt-2" onClick={async () => { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? d.copied : d.copy}</button>
    </div>
    <button className="btn btn-xs btn-ghost" onClick={onDismiss}>{d.done}</button>
  </div>;
}

function KeyEditForm({ name, group, scopes, budgetLimitQuota, groups, locale, busy, onSave, onCancel }: { name: string; group: string; scopes: string[]; budgetLimitQuota: number | null; groups: KeyGroupOption[]; locale: Locale; busy: boolean; onSave: (values: KeyDraft) => void; onCancel: () => void }) {
  const d = getDictionary(locale).dashboard.workspace.keys;
  const [draft, setDraft] = useState<KeyDraft>({ name, group, scopes, budget: budgetLimitQuota === null ? "" : (budgetLimitQuota / QUOTA_PER_USD).toFixed(2) });
  return <form className="grid gap-4 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
    <label className="form-control"><span className="label-text mb-1">{d.name}</span><input className="input input-bordered input-sm" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={d.namePlaceholder} required /></label>
    <label className="form-control"><span className="label-text mb-1">{d.group}</span><select className="select select-bordered select-sm" value={draft.group} onChange={(event) => setDraft({ ...draft, group: event.target.value })}><option value="">{d.groupDefault}</option>{groups.map((option) => <option key={option.name} value={option.name}>{option.displayName || option.name}</option>)}</select></label>
    <label className="form-control"><span className="label-text mb-1">{d.budget}</span><input className="input input-bordered input-sm" inputMode="decimal" value={draft.budget} onChange={(event) => setDraft({ ...draft, budget: event.target.value })} placeholder={d.noLimit} /></label>
    <fieldset className="md:col-span-3">
      <legend className="label-text mb-2">{d.permissions}</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{KEY_SCOPES.map((scope) => <label className="label cursor-pointer justify-start gap-3 rounded-box border border-base-300 px-3 py-2" key={scope}><input className="checkbox checkbox-sm" type="checkbox" checked={draft.scopes.includes(scope)} onChange={(event) => setDraft({ ...draft, scopes: event.target.checked ? [...draft.scopes, scope] : draft.scopes.filter((item) => item !== scope) })} /><span>{d.scopeLabels[scope]}</span></label>)}</div>
    </fieldset>
    <div className="flex gap-2 md:col-span-3">
      <button className="btn btn-sm" disabled={busy || !draft.name.trim() || draft.scopes.length === 0}>{busy ? <span className="loading loading-spinner loading-xs" /> : d.save}</button>
      <button className="btn btn-sm btn-ghost" type="button" onClick={onCancel}>{d.cancel}</button>
    </div>
  </form>;
}
