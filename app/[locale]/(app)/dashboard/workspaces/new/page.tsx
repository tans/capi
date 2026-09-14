"use client";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { localeHref, type Locale } from "@/lib/i18n/config";

export default function NewWorkspacePage() {
  const router = useRouter(); const { locale } = useParams<{ locale: Locale }>();
  const [name, setName] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(""); const response = await fetch("/api/workspaces", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name}) }); const data = await response.json().catch(() => ({})); if (!response.ok) { setError(data.error || "Unable to create workspace"); setSaving(false); return; } router.push(localeHref(locale, `/dashboard/w/${data.id}`)); }
  return <div className="mx-auto max-w-xl"><a className="link link-hover text-sm" href={localeHref(locale,"/dashboard")}>← Dashboard</a><div className="card mt-5 border border-border bg-card"><div className="card-body"><h1 className="card-title text-xl">{locale === "zh" ? "创建团队空间" : "Create team workspace"}</h1><p className="text-sm text-muted-foreground">Create a shared space for your team, keys and usage.</p><form className="mt-5 flex flex-col gap-4" onSubmit={submit}><label className="form-control"><span className="label-text mb-2 text-sm font-medium">{locale === "zh" ? "空间名称" : "Workspace name"}</span><input className="input input-bordered w-full" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Acme team" maxLength={100} required /></label>{error && <div className="alert alert-error py-2 text-sm">{error}</div>}<button className="btn btn-primary self-start" disabled={saving}>{saving ? (locale === "zh" ? "创建中…" : "Creating…") : (locale === "zh" ? "创建团队" : "Create team")}</button></form></div></div></div>;
}
