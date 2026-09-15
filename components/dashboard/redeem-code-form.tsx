"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RedeemCodeForm({ workspaceId, workspaceName }: { workspaceId: number; workspaceName: string }) {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/user/redeem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, workspaceId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message || result?.error || "Unable to redeem this code.");
      setMessage(`${result.replayed ? "This code was already credited to this workspace. Balance confirmed" : "Added"}: $${Number(result.amount).toFixed(2)}.`);
      setCode("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to redeem this code.");
    } finally { setBusy(false); }
  }

  return <section className="card border border-border bg-card shadow-sm">
    <div className="card-body gap-4 p-5">
      <div><h2 className="card-title text-base">Add credit</h2><p className="text-sm text-muted-foreground">Redeem a code to charge <strong>{workspaceName}</strong>.</p></div>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="form-control w-full max-w-md"><span className="label-text mb-2 text-sm">Redeem code</span><Input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="CAPI-…" autoComplete="off" disabled={busy} /></label>
        <Button type="submit" disabled={busy || !code.trim()}>{busy ? "Redeeming…" : "Redeem"}</Button>
      </form>
      {error && <div role="alert" className="alert alert-error py-2 text-sm">{error}</div>}
      {message && <div role="status" className="alert alert-success py-2 text-sm">{message}</div>}
    </div>
  </section>;
}
