"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

export type KeyGroupOption = { name: string; displayName: string };

/** Scopes the relay enforces for workspace keys. */
const KEY_SCOPES = ["llm.chat", "llm.evaluate", "image.generate", "video.generate", "billing.read"] as const;

type Props = {
  workspaceId: number;
  groups: KeyGroupOption[];
  canManage: boolean;
  locale: Locale;
};

export function WorkspaceKeyManager({ workspaceId, groups, canManage, locale }: Props) {
  const d = getDictionary(locale).dashboard.workspace.keys;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [selected, setSelected] = useState<string[]>(["llm.chat"]);
  const [budget, setBudget] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canManage) return null;

  const openCreate = () => {
    setError("");
    setSecret("");
    setCopied(false);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setSecret("");
    setError("");
    router.refresh();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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
        setError(data.error || d.createError);
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
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          <span aria-hidden="true" className="text-lg leading-none">+</span>
          {d.create}
        </button>
      </div>

      {open && (
        <div className="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="create-key-title">
          <div className="modal-box max-w-2xl">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" type="button" onClick={close} aria-label={d.cancel}>✕</button>
            {!secret ? (
              <>
                <h2 id="create-key-title" className="text-xl font-semibold">{d.createTitle}</h2>
                <p className="mt-1 text-sm text-base-content/60">{d.description}</p>
                <form className="mt-6 grid gap-5" onSubmit={submit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="form-control">
                      <span className="label-text mb-1">{d.name}</span>
                      <input className="input input-bordered" value={name} onChange={(event) => setName(event.target.value)} placeholder={d.namePlaceholder} required autoFocus />
                    </label>
                    <label className="form-control">
                      <span className="label-text mb-1">{d.group}</span>
                      <select className="select select-bordered" value={group} onChange={(event) => setGroup(event.target.value)}>
                        <option value="">{d.groupDefault}</option>
                        {groups.map((option) => <option key={option.name} value={option.name}>{option.displayName || option.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="form-control">
                    <span className="label-text mb-1">{d.budget}</span>
                    <input className="input input-bordered" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder={d.noLimit} />
                  </label>
                  <fieldset>
                    <legend className="label-text mb-2">{d.permissions}</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {KEY_SCOPES.map((scope) => (
                        <label className="label cursor-pointer justify-start gap-3 rounded-box border border-base-300 px-3 py-2" key={scope}>
                          <input className="checkbox checkbox-sm" type="checkbox" checked={selected.includes(scope)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} />
                          <span>{d.scopeLabels[scope]}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {error && <div className="alert alert-error" role="alert">{error}</div>}
                  <div className="modal-action mt-1">
                    <button className="btn btn-ghost" type="button" onClick={close}>{d.cancel}</button>
                    <button className="btn btn-primary" disabled={busy || !name.trim() || selected.length === 0}>
                      {busy ? <span className="loading loading-spinner loading-sm" /> : d.create}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="py-4">
                <h2 className="text-xl font-semibold">{d.secretTitle}</h2>
                <p className="mt-1 text-sm text-base-content/60">{d.secretDescription}</p>
                <code className="mt-5 block break-all rounded-box bg-base-200 p-4 text-sm">{secret}</code>
                <p className="mt-3 text-xs text-base-content/60">{d.secretOnce}</p>
                <div className="modal-action">
                  <button className="btn" type="button" onClick={copy}>{copied ? d.copied : d.copy}</button>
                  <button className="btn btn-primary" type="button" onClick={close}>{d.done}</button>
                </div>
              </div>
            )}
          </div>
          <button className="modal-backdrop" type="button" onClick={close} aria-label={d.cancel} />
        </div>
      )}
    </>
  );
}
