"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { Currency } from "@/lib/relay/currency";

export type KeyGroupOption = { name: string; displayName: string };

/** Scopes the relay enforces for workspace keys. */
const KEY_SCOPES = ["workspace.manage", "llm.chat", "llm.systemone", "image.generate", "video.generate", "files.write", "billing.read"] as const;

type Props = {
  workspaceId: string;
  groups: KeyGroupOption[];
  canManage: boolean;
  locale: Locale;
  currency: Currency;
};

export function WorkspaceKeyManager({ workspaceId, groups, canManage, locale, currency }: Props) {
  const d = getDictionary(locale).dashboard.workspace.keys;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [selected, setSelected] = useState<string[]>(["workspace.manage"]);
  const [budget, setBudget] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [open]);

  if (!canManage) return null;

  const openCreate = () => {
    setError("");
    setSecret("");
    setCopied(false);
    setGroup("");
    setSelected(["workspace.manage"]);
    setName("");
    setBudget("");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setSecret("");
    setError("");
    router.refresh();
  };

  const closeSafely = () => {
    if (secret && !copied && !window.confirm(d.secretCloseConfirm)) return;
    close();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setError("");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setError(d.copyError);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, group, scopes: selected.join(","), budget }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : data.error?.message || d.createError);
        return;
      }
      setSecret(data.secret);
      setName("");
      setBudget("");
      router.refresh();
    } catch {
      setError(d.createError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 border-transparent bg-brand text-brand-foreground hover:bg-brand-hover" type="button" onClick={openCreate}>
          <span aria-hidden="true" className="text-lg leading-none">+</span>
          {d.create}
        </button>
      </div>

      {open && (
        <dialog ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" aria-labelledby="create-key-title" onCancel={(event) => { event.preventDefault(); if (!busy) closeSafely(); }}>
          <div className="relative mx-auto max-h-[90vh] max-w-2xl overflow-auto rounded-lg bg-background p-6 shadow-lg">
            <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-8 px-3 rounded-full border-transparent bg-transparent absolute right-2 top-2" type="button" onClick={closeSafely} disabled={busy} aria-label={d.cancel}>✕</button>
            {!secret ? (
              <>
                <h2 id="create-key-title" className="text-xl font-semibold">{d.createTitle}</h2>
                <p className="mt-1 text-sm text-foreground/60">{d.description}</p>
                <form className="mt-6 grid gap-5" onSubmit={submit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col">
                      <span className="text-sm text-muted-foreground mb-1">{d.name}</span>
                      <input className="h-9 w-full rounded-sm border border-input bg-transparent px-3 py-1 text-sm" value={name} onChange={(event) => setName(event.target.value)} placeholder={d.namePlaceholder} required autoFocus />
                    </label>
                    <label className="flex flex-col">
                      <span className="text-sm text-muted-foreground mb-1">{d.group}</span>
                      <select className="h-9 w-full rounded-sm border border-input bg-background px-3 text-sm" value={group} onChange={(event) => setGroup(event.target.value)}>
                        <option value="">{d.groupDefault}</option>
                        {groups.map((option) => <option key={option.name} value={option.name}>{option.displayName || option.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="flex flex-col">
                    <span className="text-sm text-muted-foreground mb-1">{d.budgetColumn} ({currency.code}, {locale === "zh" ? "可选" : "optional"})</span>
                    <input className="h-9 w-full rounded-sm border border-input bg-transparent px-3 py-1 text-sm" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder={d.noLimit} />
                  </label>
                  <fieldset>
                    <legend className="text-sm text-muted-foreground mb-2">{d.permissions}</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {KEY_SCOPES.map((scope) => (
                        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2" key={scope}>
                          <input className="size-4 accent-brand size-3.5" type="checkbox" checked={selected.includes(scope)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} />
                          <span>{d.scopeLabels[scope]}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {error && <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm border-error/30 bg-error/5 text-error" role="alert">{error}</div>}
                  <div className="mt-4 flex justify-end gap-2 mt-1">
                    <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 border-transparent bg-transparent" type="button" onClick={close} disabled={busy}>{d.cancel}</button>
                    <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 border-transparent bg-brand text-brand-foreground hover:bg-brand-hover" disabled={busy || !name.trim() || selected.length === 0}>
                      {busy ? <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent size-4" /> : d.create}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="py-4">
                <h2 id="create-key-title" className="text-xl font-semibold">{d.secretTitle}</h2>
                <p className="mt-1 text-sm text-foreground/60">{d.secretDescription}</p>
                <code className="mt-5 block break-all rounded-lg bg-muted p-4 text-sm">{secret}</code>
                <p className="mt-3 text-xs text-foreground/60">{d.secretOnce}</p>
                {error && <p className="mt-3 text-sm text-error" role="alert">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50" type="button" onClick={copy}>{copied ? d.copied : d.copy}</button>
                  <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 border-transparent bg-brand text-brand-foreground hover:bg-brand-hover" type="button" onClick={closeSafely}>{d.done}</button>
                </div>
              </div>
            )}
          </div>
          <button className="absolute inset-0" type="button" onClick={closeSafely} disabled={busy} aria-label={d.cancel} />
        </dialog>
      )}
    </>
  );
}
