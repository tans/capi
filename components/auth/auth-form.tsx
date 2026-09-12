"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type Mode = "login" | "signup";

export function AuthForm({
  mode,
  dict,
  localePrefix,
}: {
  mode: Mode;
  dict: Dictionary["auth"];
  localePrefix: string;
}) {
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
      next.email = dict.validation.email;
    }
    if (values.password.length < 8 || new TextEncoder().encode(values.password).length > 1024) {
      next.password = dict.errors.invalid_password;
    }
    if (mode === "signup" && values.password !== values.confirm) {
      next.confirm = dict.validation.confirm;
    }
    if (mode === "signup" && (!values.name.trim() || values.name.trim().length > 100)) {
      next.name = dict.errors.invalid_name;
    }
    return next;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: values.email, password: values.password, name: values.name }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const code = result?.error?.code as keyof typeof dict.errors | undefined;
        setErrors({ form: code && Object.hasOwn(dict.errors, code) ? dict.errors[code] : dict.errors.internal_error });
        return;
      }
      router.replace(`${localePrefix}/dashboard`);
      router.refresh();
    } catch {
      setErrors({ form: dict.errors.network });
    } finally {
      setBusy(false);
    }
  }

  const submitLabel =
    mode === "login" ? dict.login.submit : dict.signup.submit;

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy} className="flex flex-col gap-5">
      {mode === "signup" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{dict.fields.name}</Label>
          <Input
            id="name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            aria-invalid={Boolean(errors.name)}
            placeholder={dict.fields.namePlaceholder}
            autoComplete="name"
          />
          {errors.name ? (
            <p className="text-[12px] text-destructive">{errors.name}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{dict.fields.email}</Label>
        <Input
          id="email"
          type="email"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          aria-invalid={Boolean(errors.email)}
          placeholder={dict.fields.emailPlaceholder}
          autoComplete="email"
        />
        {errors.email ? (
          <p className="text-[12px] text-destructive">{errors.email}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{dict.fields.password}</Label>
        <Input
          id="password"
          type="password"
          value={values.password}
          onChange={(e) => set("password", e.target.value)}
          aria-invalid={Boolean(errors.password)}
          placeholder={dict.fields.passwordPlaceholder}
          autoComplete={
            mode === "login" ? "current-password" : "new-password"
          }
        />
        {errors.password ? (
          <p className="text-[12px] text-destructive">{errors.password}</p>
        ) : null}
      </div>

      {mode === "signup" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm">{dict.fields.password}</Label>
          <Input
            id="confirm"
            type="password"
            value={values.confirm}
            onChange={(e) => set("confirm", e.target.value)}
            aria-invalid={Boolean(errors.confirm)}
            autoComplete="new-password"
          />
          {errors.confirm ? (
            <p className="text-[12px] text-destructive">
              {errors.confirm}
            </p>
          ) : null}
        </div>
      ) : null}

      {errors.form ? (
        <p role="alert" className="text-sm text-destructive">{errors.form}</p>
      ) : null}

      <Button type="submit" variant="brand" size="lg" disabled={busy}>
        {busy ? "…" : submitLabel}
      </Button>

      <p className="text-center text-[12px] text-muted-foreground">
        {mode === "login" ? dict.login.noAccount : dict.signup.hasAccount}{" "}
        <Link
          href={
            mode === "login"
              ? `${localePrefix}/signup`
              : `${localePrefix}/login`
          }
          className="text-brand underline-offset-4 hover:underline"
        >
          {mode === "login" ? dict.login.createOne : dict.signup.signIn}
        </Link>
      </p>

    </form>
  );
}
