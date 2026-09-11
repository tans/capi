"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "signup";

const copy: Record<
  Mode,
  { submit: string; alt: string; altHref: string; altLabel: string }
> = {
  login: {
    submit: "Sign in",
    alt: "Don't have an account?",
    altHref: "/signup",
    altLabel: "Create one",
  },
  signup: {
    submit: "Create account",
    alt: "Already have an account?",
    altHref: "/login",
    altLabel: "Sign in",
  },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [values, setValues] = React.useState({
    email: "",
    password: "",
    confirm: "",
    name: "",
  });

  function set(key: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (values.password.length < 8) {
      next.password = "Use at least 8 characters.";
    }
    if (mode === "signup" && values.password !== values.confirm) {
      next.confirm = "Passwords do not match.";
    }
    if (mode === "signup" && !values.name.trim()) {
      next.name = "Tell us what to call you.";
    }
    return next;
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // No real authentication in this build — route straight to the dashboard.
    setBusy(true);
    window.setTimeout(() => router.push("/dashboard"), 450);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {mode === "signup" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            aria-invalid={Boolean(errors.name)}
            placeholder="Ada Lovelace"
            autoComplete="name"
          />
          {errors.name ? (
            <p className="text-[12px] text-destructive">{errors.name}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          aria-invalid={Boolean(errors.email)}
          placeholder="you@example.com"
          autoComplete="email"
        />
        {errors.email ? (
          <p className="text-[12px] text-destructive">{errors.email}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={values.password}
          onChange={(e) => set("password", e.target.value)}
          aria-invalid={Boolean(errors.password)}
          placeholder="At least 8 characters"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {errors.password ? (
          <p className="text-[12px] text-destructive">{errors.password}</p>
        ) : null}
      </div>

      {mode === "signup" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            value={values.confirm}
            onChange={(e) => set("confirm", e.target.value)}
            aria-invalid={Boolean(errors.confirm)}
            autoComplete="new-password"
          />
          {errors.confirm ? (
            <p className="text-[12px] text-destructive">{errors.confirm}</p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" variant="brand" size="lg" disabled={busy}>
        {busy ? "Please wait…" : copy[mode].submit}
      </Button>

      <p className="text-center text-[12px] text-muted-foreground">
        {copy[mode].alt}{" "}
        <Link
          href={copy[mode].altHref}
          className="text-brand underline-offset-4 hover:underline"
        >
          {copy[mode].altLabel}
        </Link>
      </p>

      <p className="rounded-sm border border-border bg-muted/40 px-3 py-2.5 text-center text-[11px] leading-relaxed text-muted-foreground">
        Demo build — credentials are not stored and no request is sent. Any
        valid-looking email and an 8-character password will continue.
      </p>
    </form>
  );
}
