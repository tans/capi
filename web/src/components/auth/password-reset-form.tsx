"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

export function PasswordResetForm({ dict, localePrefix }: { dict: Dictionary["auth"]; localePrefix: string }) {
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function sendCode() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/forgot-password/code", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const key = result?.error?.code as keyof typeof dict.errors | undefined;
        setError(key && Object.hasOwn(dict.errors, key) ? dict.errors[key] : dict.reset.failed);
        return;
      }
      setSent(true);
    } catch {
      setError(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/forgot-password/reset", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ email, code, password }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const key = result?.error?.code as keyof typeof dict.errors | undefined;
        setError(key && Object.hasOwn(dict.errors, key) ? dict.errors[key] : dict.reset.failed);
        return;
      }
      setDone(true);
    } catch {
      setError(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  if (done) return <div className="flex flex-col gap-5">
    <p role="status" className="text-sm text-foreground">{dict.reset.done}</p>
    <Link href={`${localePrefix}/login`} className="text-sm text-brand underline-offset-4 hover:underline">{dict.reset.back}</Link>
  </div>;

  return <form onSubmit={submit} noValidate aria-busy={busy} className="flex flex-col gap-5">
    <div className="flex flex-col gap-2">
      <Label htmlFor="reset-email">{dict.fields.email}</Label>
      <Input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={dict.fields.emailPlaceholder} autoComplete="email" required />
    </div>
    {sent ? <>
      <p role="status" className="text-[12px] text-muted-foreground">{dict.reset.sent}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-code">{dict.reset.code}</Label>
        <Input id="reset-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-password">{dict.reset.password}</Label>
        <Input id="reset-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
      </div>
    </> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {sent ? <Button type="submit" variant="brand" size="lg" disabled={busy}>{busy ? "…" : dict.reset.submit}</Button> : <Button type="button" variant="brand" size="lg" disabled={busy || !email.trim()} onClick={sendCode}>{busy ? "…" : dict.reset.sendCode}</Button>}
    {sent ? <Button type="button" variant="outline" disabled={busy} onClick={sendCode}>{dict.reset.sendCode}</Button> : null}
    <Link href={`${localePrefix}/login`} className="text-center text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{dict.reset.back}</Link>
  </form>;
}
