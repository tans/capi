"use client";

import { useEffect, useState } from "react";
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
  const d = getDictionary(locale).dashboard.components.settings;
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [jev, setJev] = useState({ autoRoutingEnabled: false, securityAuditEnabled: false });
  const [routeConfig, setRouteConfig] = useState({ alias: "capi-auto", chat: { light: "gpt-4o-mini", standard: "gpt-4o", advanced: "gpt-5.5" }, code: { light: "gpt-4o-mini", standard: "gpt-5.5", advanced: "gpt-5.5" } });
  const [canManage, setCanManage] = useState(false);
  const [jevMsg, setJevMsg] = useState("");

  useEffect(() => {
    void fetch(`/api/workspaces/${workspaceId}`).then((response) => response.json()).then((data) => {
      setName(data.name ?? "");
      setJev(data.jev ?? { autoRoutingEnabled: false, securityAuditEnabled: false });
      if (data.jev?.routeConfig) setRouteConfig((current) => ({ alias: data.jev.routeConfig.alias ?? "capi-auto", chat: { ...current.chat, ...(data.jev.routeConfig.profiles?.chat ?? {}) }, code: { ...current.code, ...(data.jev.routeConfig.profiles?.code ?? {}) } }));
      setCanManage(data.role === "owner" || data.role === "admin");
    });
  }, [workspaceId]);

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

  async function saveJev(next: Partial<typeof jev>) {
    const value = { ...jev, ...next };
    setJev(value);
    const response = await fetch(`/api/workspaces/${workspaceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jevAutoRoutingEnabled: value.autoRoutingEnabled, jevSecurityAuditEnabled: value.securityAuditEnabled }) });
    setJevMsg(response.ok ? d.jevSaved : d.jevError);
  }

  async function saveRouteConfig(next: typeof routeConfig) {
    setRouteConfig(next);
    const response = await fetch(`/api/workspaces/${workspaceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ routeConfig: { alias: next.alias.trim() || "capi-auto", profiles: { chat: next.chat, code: next.code, analysis: next.chat, sensitive: { standard: next.code.standard }, media: { standard: next.chat.standard }, other: { standard: next.chat.standard } }, fallback: { intent: "other", complexity: "standard" } } }) });
    setJevMsg(response.ok ? d.jevSaved : d.jevError);
  }

  return (
    <div className="max-w-2xl">
      <a className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${workspaceId}`)}>← {t.back}</a>
      <h1 className="mt-4 text-2xl font-semibold">{t.title}</h1>
      <form onSubmit={save} className="card mt-5 border border-border bg-card">
        <div className="card-body">
          <label className="form-control"><span className="label-text mb-2">{t.name}</span><input className="input input-bordered" value={name} onChange={(event) => setName(event.target.value)} placeholder={t.placeholder} required /></label>
          <button className="btn btn-primary mt-3 self-start">{t.save}</button>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        </div>
      </form>
      <section className="card mt-5 border border-border bg-card">
        <div className="card-body">
          <h2 className="card-title text-base">{d.jevTitle}</h2>
          <p className="text-sm text-muted-foreground">{d.jevDescription}</p>
          <div className="mt-3 divide-y divide-border">
            <label className="flex items-center justify-between gap-4 py-3"><span><span className="block text-sm font-medium">{d.jevRoute}</span><span className="text-xs text-muted-foreground">{d.autoRouteDescription}</span></span><input type="checkbox" className="toggle toggle-primary" checked={jev.autoRoutingEnabled} disabled={!canManage} onChange={(event) => void saveJev({ autoRoutingEnabled: event.target.checked })} /></label>
            <label className="flex items-center justify-between gap-4 py-3"><span><span className="block text-sm font-medium">{d.jevAudit}</span><span className="text-xs text-muted-foreground">{d.jevReadonly}</span></span><input type="checkbox" className="toggle toggle-primary" checked={jev.securityAuditEnabled} disabled={!canManage} onChange={(event) => void saveJev({ securityAuditEnabled: event.target.checked })} /></label>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm font-medium">{d.routeName}</p>
            <input className="input input-bordered input-sm mt-2 w-full" value={routeConfig.alias} disabled={!canManage} onChange={(event) => setRouteConfig((current) => ({ ...current, alias: event.target.value }))} onBlur={() => void saveRouteConfig(routeConfig)} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(["chat", "code"] as const).map((intent) => (
                <div key={intent} className="rounded-md border border-border p-3">
                  <p className="text-xs font-semibold uppercase">{intent}</p>
                  {(["light", "standard", "advanced"] as const).map((tier) => (
                    <label key={tier} className="mt-2 block"><span className="text-xs text-muted-foreground">{tier} {d.modelSuffix}</span><input className="input input-bordered input-sm mt-1 w-full" value={routeConfig[intent][tier]} disabled={!canManage} onChange={(event) => setRouteConfig((current) => ({ ...current, [intent]: { ...current[intent], [tier]: event.target.value } }))} onBlur={() => void saveRouteConfig(routeConfig)} /></label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {jevMsg && <p className="text-sm text-muted-foreground">{jevMsg}</p>}
        </div>
      </section>
    </div>
  );
}
