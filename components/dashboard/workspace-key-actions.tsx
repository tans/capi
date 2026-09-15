"use client";
import { useState } from "react";

export function WorkspaceKeyActions({ workspaceId, keyId, status }: { workspaceId: number; keyId: number; status: number }) {
  const [busy, setBusy] = useState<"revoke" | "rotate" | null>(null);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const rotate = async () => {
    if (!confirm("Rotate this key? The old secret stops working.")) return;
    setError(""); setBusy("rotate");
    try { const response = await fetch(`/api/workspaces/${workspaceId}/keys`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: keyId, action: "rotate" }) }); const data = await response.json(); if (!response.ok) { setError(data.error || "Unable to rotate key"); return; } setSecret(data.secret); } catch { setError("Unable to rotate key"); } finally { setBusy(null); }
  };
  const revoke = async () => {
    if (!confirm("Revoke this key? Existing clients will stop working immediately.")) return;
    setError(""); setBusy("revoke");
    try { const response = await fetch(`/api/workspaces/${workspaceId}/keys?id=${keyId}`, { method: "DELETE" }); if (!response.ok) { const data = await response.json(); setError(data.error || "Unable to revoke key"); return; } window.location.reload(); } catch { setError("Unable to revoke key"); } finally { setBusy(null); }
  };
  return <div className="flex flex-col items-end gap-2"><div className="flex gap-1">{status === 1 && <button className="btn btn-xs btn-ghost" disabled={busy !== null} onClick={rotate}>{busy === "rotate" ? <span className="loading loading-spinner loading-xs" /> : "Rotate"}</button>} {status === 1 && <button className="btn btn-xs btn-ghost text-error" disabled={busy !== null} onClick={revoke}>{busy === "revoke" ? <span className="loading loading-spinner loading-xs" /> : "Revoke"}</button>}</div>{error && <p className="text-xs text-error">{error}</p>}{secret && <div className="alert alert-success w-72 items-start p-3 text-xs"><div className="min-w-0 flex-1"><code className="block break-all">{secret}</code><button className="btn btn-xs mt-2" onClick={copy}>{copied ? "Copied" : "Copy"}</button></div><button className="btn btn-xs btn-ghost" onClick={() => { setSecret(""); window.location.reload(); }}>Done</button></div>}</div>;
}
