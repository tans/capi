"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type Dict = Dictionary["dashboard"]["account"];

/** Read-only account facts plus the sign-in password change form. */
export function AccountForm({
  dict,
  locale,
  user,
}: {
  dict: Dict;
  locale: Locale;
  user: { name: string; email: string; createdAt: number };
}) {
  const [busy, setBusy] = React.useState(false);
  const [changed, setChanged] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const currentRef = React.useRef<HTMLInputElement>(null);
  const nextRef = React.useRef<HTMLInputElement>(null);
  const confirmRef = React.useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const currentPassword = currentRef.current?.value ?? "";
    const newPassword = nextRef.current?.value ?? "";
    setChanged(false);
    if (newPassword !== (confirmRef.current?.value ?? "")) {
      setError(dict.mismatch);
      return;
    }
    if (newPassword.length < 8) {
      setError(dict.invalidNew);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/user/password", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { code?: string } }
          | null;
        const code = payload?.error?.code;
        setError(
          code === "invalid_current_password"
            ? dict.wrongCurrent
            : code === "invalid_password"
              ? dict.invalidNew
              : dict.changeFailed,
        );
        return;
      }
      for (const ref of [currentRef, nextRef, confirmRef]) {
        if (ref.current) ref.current.value = "";
      }
      setChanged(true);
    } catch {
      setError(dict.changeFailed);
    } finally {
      setBusy(false);
    }
  }

  const memberSince = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(user.createdAt),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          {dict.title}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{dict.description}</p>
      </div>

      <div className="rounded-md border border-border bg-card p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          {dict.profile}
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="account-name">{dict.name}</Label>
            <Input id="account-name" defaultValue={user.name} readOnly />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="account-email">{dict.email}</Label>
            <Input id="account-email" type="email" defaultValue={user.email} readOnly />
            <p className="text-[11px] text-muted-foreground">{dict.emailDescription}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="account-since">{dict.memberSince}</Label>
            <Input id="account-since" defaultValue={memberSince} readOnly />
          </div>
        </div>
      </div>

      <form className="rounded-md border border-border bg-card p-6" onSubmit={submit}>
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          {dict.password}
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground">{dict.passwordDescription}</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">{dict.currentPassword}</Label>
            <Input
              id="current-password"
              ref={currentRef}
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">{dict.newPassword}</Label>
            <Input
              id="new-password"
              ref={nextRef}
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">{dict.confirmPassword}</Label>
            <Input
              id="confirm-password"
              ref={confirmRef}
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button variant="brand" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "…" : dict.changePassword}
          </Button>
          {error ? (
            <span role="alert" className="text-[12px] text-destructive">
              {error}
            </span>
          ) : null}
          {changed && !error ? (
            <span className="text-[12px] text-muted-foreground">{dict.changed}</span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
