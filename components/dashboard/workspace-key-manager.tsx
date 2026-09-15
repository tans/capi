"use client";
import { useState } from "react";

const scopes = [
  ["llm.chat", "推理 / Inference"],
  ["video.generate", "视频 / Video"],
  ["billing.read", "账单查询 / Billing read"],
] as const;

export function WorkspaceKeyManager({ workspaceId, canManage }: { workspaceId: number; canManage: boolean }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>(["llm.chat"]);
  const [budget, setBudget] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!canManage) return null;
  const copy = async () => { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const closeSecret = () => { setSecret(""); window.location.reload(); };
  return <section className="card border border-base-300 bg-base-100 shadow-sm">
    <div className="card-body gap-5">
      <div><h2 className="card-title text-lg">Create an API key</h2><p className="text-sm text-base-content/60">The secret appears once. Store it somewhere safe.</p></div>
      <form className="grid gap-4 md:grid-cols-[1fr_auto]" onSubmit={async (event) => { event.preventDefault(); setError(""); setBusy(true); try { const response = await fetch(`/api/workspaces/${workspaceId}/keys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes: selected.join(","), budget }) }); const data = await response.json(); if (!response.ok) { setError(data.error || "Unable to create key"); return; } setSecret(data.secret); setName(""); setBudget(""); } catch { setError("Unable to create key"); } finally { setBusy(false); } }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="form-control"><span className="label-text mb-1">Name</span><input className="input input-bordered" value={name} onChange={(event) => setName(event.target.value)} placeholder="web-prod-images" required /></label>
          <label className="form-control"><span className="label-text mb-1">Budget (USD, optional)</span><input className="input input-bordered" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="No limit" /></label>
          <fieldset className="sm:col-span-2"><legend className="label-text mb-2">Permissions</legend><div className="grid gap-2 sm:grid-cols-3">{scopes.map(([value, label]) => <label className="label cursor-pointer justify-start gap-3 rounded-box border border-base-300 px-3 py-2" key={value}><input className="checkbox checkbox-sm" type="checkbox" checked={selected.includes(value)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, value] : current.filter((item) => item !== value))} /><span>{label}</span></label>)}</div></fieldset>
        </div>
        <button className="btn self-end" disabled={busy || !name.trim() || selected.length === 0}>{busy ? <span className="loading loading-spinner loading-sm" /> : "Create key"}</button>
      </form>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {secret && <div className="alert alert-success items-start"><div className="min-w-0 flex-1"><p className="font-semibold">Your new secret</p><code className="mt-2 block break-all rounded bg-base-100/70 p-2 text-xs">{secret}</code><p className="mt-2 text-xs">Copy it now. It cannot be shown again.</p></div><div className="flex shrink-0 gap-2"><button className="btn btn-sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button><button className="btn btn-sm btn-ghost" onClick={closeSecret}>Done</button></div></div>}
    </div>
  </section>;
}
