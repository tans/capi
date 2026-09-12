"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
export function SignOutButton({ label, errorLabel, destination }: { label: string; errorLabel: string; destination: string }) {
  const router = useRouter(); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState(false);
  async function signOut() { if (busy) return; setBusy(true); setError(false); try { const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); if (!response.ok) throw new Error("logout failed"); router.replace(destination); router.refresh(); } catch { setError(true); setBusy(false); } }
  return <><button type="button" onClick={signOut} disabled={busy} aria-busy={busy} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">{busy ? "…" : label}</button>{error ? <span role="alert" className="text-[11px] text-destructive">{errorLabel}</span> : null}</>;
}
