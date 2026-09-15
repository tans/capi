"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";

export default function NewWorkspacePage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const t = getDictionary(locale).dashboard.workspace.create;
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || t.error);
      setSaving(false);
      return;
    }
    router.push(localeHref(locale, `/dashboard/w/${data.id}`));
  }

  return <div className="mx-auto max-w-xl"><a className="link link-hover text-sm" href={localeHref(locale, "/dashboard")}>← {t.back}</a><div className="card mt-5 border border-border bg-card"><div className="card-body"><h1 className="card-title text-xl">{t.title}</h1><p className="text-sm text-muted-foreground">{t.description}</p><form className="mt-5 flex flex-col gap-4" onSubmit={submit}><label className="form-control"><span className="label-text mb-2 text-sm font-medium">{t.name}</span><input className="input input-bordered w-full" value={name} onChange={(event) => setName(event.target.value)} placeholder={t.placeholder} maxLength={100} required /></label>{error && <div className="alert alert-error py-2 text-sm">{error}</div>}<button className="btn btn-primary self-start" disabled={saving}>{saving ? t.saving : t.submit}</button></form></div></div></div>;
}
