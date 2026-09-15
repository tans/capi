"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";

export default function WorkspaceSettings() {
  const { workspaceId, locale } = useParams<{
    workspaceId: string;
    locale: Locale;
  }>();
  const router = useRouter();
  const t = getDictionary(locale).dashboard.workspace.settings;
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setMsg(response.ok ? t.saved : t.error);
    if (response.ok) router.refresh();
  }

  return <div className="max-w-xl"><a className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${workspaceId}`)}>← {t.back}</a><h1 className="mt-4 text-2xl font-semibold">{t.title}</h1><form onSubmit={save} className="card mt-5 border border-border bg-card"><div className="card-body"><label className="form-control"><span className="label-text mb-2">{t.name}</span><input className="input input-bordered" value={name} onChange={(event) => setName(event.target.value)} placeholder={t.placeholder} required /></label><button className="btn btn-primary mt-3 self-start">{t.save}</button>{msg && <p className="text-sm text-muted-foreground">{msg}</p>}</div></form></div>;
}
