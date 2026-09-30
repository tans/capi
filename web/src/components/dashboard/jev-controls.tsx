"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";

type RouteConfig = {
  alias: string;
  chat: Record<"light" | "standard" | "advanced", string>;
  code: Record<"light" | "standard" | "advanced", string>;
};

const defaultRouteConfig: RouteConfig = {
  alias: "capi-auto",
  chat: { light: "gpt-4o-mini", standard: "gpt-4o", advanced: "gpt-5.5" },
  code: { light: "gpt-4o-mini", standard: "gpt-5.5", advanced: "gpt-5.5" },
};

export default function WorkspaceJevControls() {
  const { workspaceId, locale } = useParams<{ workspaceId: string; locale: Locale }>();
  const d = getDictionary(locale).dashboard.components.settings;
  const [jev, setJev] = useState({ autoRoutingEnabled: false, securityAuditEnabled: false });
  const [routeConfig, setRouteConfig] = useState<RouteConfig>(defaultRouteConfig);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [jevMsg, setJevMsg] = useState("");

  useEffect(() => {
    void fetch(`/api/workspaces/${workspaceId}`)
      .then((response) => response.json())
      .then((data) => {
        setJev(data.jev ?? { autoRoutingEnabled: false, securityAuditEnabled: false });
        if (data.jev?.routeConfig) {
          setRouteConfig((current) => ({
            alias: data.jev.routeConfig.alias ?? "capi-auto",
            chat: { ...current.chat, ...(data.jev.routeConfig.profiles?.chat ?? {}) },
            code: { ...current.code, ...(data.jev.routeConfig.profiles?.code ?? {}) },
          }));
        }
        setCanManage(data.role === "owner" || data.role === "admin");
        setLoaded(true);
      });
  }, [workspaceId]);

  async function saveJev(next: Partial<typeof jev>) {
    const value = { ...jev, ...next };
    setJev(value);
    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jevAutoRoutingEnabled: value.autoRoutingEnabled, jevSecurityAuditEnabled: value.securityAuditEnabled }),
    });
    setJevMsg(response.ok ? d.jevSaved : d.jevError);
  }

  async function saveRouteConfig() {
    const next = { ...routeConfig, alias: routeConfig.alias.trim() || "capi-auto" };
    setRouteConfig(next);
    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routeConfig: { alias: next.alias, profiles: { chat: next.chat, code: next.code, analysis: next.chat, sensitive: { standard: next.code.standard }, media: { standard: next.chat.standard }, other: { standard: next.chat.standard } }, fallback: { intent: "other", complexity: "standard" } } }),
    });
    setJevMsg(response.ok ? d.jevSaved : d.jevError);
  }

  function updateRouteModel(profile: "chat" | "code", tier: "light" | "standard" | "advanced", value: string) {
    setRouteConfig((current) => ({ ...current, [profile]: { ...current[profile], [tier]: value } }));
  }

  return (
    <section id="jev-controls" className="card scroll-mt-28 border border-border bg-card">
      <div className="card-body gap-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div><h1 className="text-[22px] font-semibold tracking-tight">{d.jevTitle}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{d.jevDescription}</p></div>
          <div className="flex flex-wrap gap-2"><span className={`badge badge-soft ${jev.autoRoutingEnabled ? "badge-success" : "badge-ghost"}`}>{d.jevRoute}: {jev.autoRoutingEnabled ? d.jevEnabled : d.jevDisabled}</span><span className={`badge badge-soft ${jev.securityAuditEnabled ? "badge-success" : "badge-ghost"}`}>{d.jevAudit}: {jev.securityAuditEnabled ? d.jevEnabled : d.jevDisabled}</span></div>
        </div>
        <div className="divide-y divide-border rounded-box border border-border">
          <label id="jev-routing" className="flex items-center justify-between gap-4 p-4"><span><span className="block text-sm font-medium">{d.jevRoute}</span><span className="mt-1 block text-xs text-muted-foreground">{d.jevRouteDescription}</span></span><input type="checkbox" role="switch" className="peer sr-only" checked={jev.autoRoutingEnabled} disabled={!loaded || !canManage} onChange={(event) => void saveJev({ autoRoutingEnabled: event.target.checked })} /><span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full border border-border bg-muted transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-[18px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:border-brand peer-checked:bg-brand peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-disabled:opacity-60" /></label>
          <label id="jev-security-audit" className="flex items-center justify-between gap-4 p-4"><span><span className="block text-sm font-medium">{d.jevAudit}</span><span className="mt-1 block text-xs text-muted-foreground">{d.jevAuditDescription}</span></span><input type="checkbox" role="switch" className="peer sr-only" checked={jev.securityAuditEnabled} disabled={!loaded || !canManage} onChange={(event) => void saveJev({ securityAuditEnabled: event.target.checked })} /><span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full border border-border bg-muted transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-[18px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:border-brand peer-checked:bg-brand peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-disabled:opacity-60" /></label>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><span>{d.jevReadonly}</span><Link className="link link-hover" href={localeHref(locale, `/dashboard/w/${workspaceId}/routing-security#jev-security-audit`)}>{d.jevAudit}</Link></div>
        {jevMsg && <p role="status" className={`text-sm ${jevMsg === d.jevError ? "text-error" : "text-success"}`}>{jevMsg}</p>}
        <fieldset disabled={!jev.autoRoutingEnabled || !canManage} className={`space-y-4 ${jev.autoRoutingEnabled ? "" : "opacity-50"}`}>
          <div className="border-t border-border pt-5"><h2 className="text-sm font-medium">{d.autoRoute}</h2><p className="mt-1 text-xs text-muted-foreground">{jev.autoRoutingEnabled ? d.autoRouteDescription : d.enableRoutingToConfigure}</p></div>
          <label className="form-control"><span className="label-text mb-2">{d.routeName}</span><input className="input input-bordered" value={routeConfig.alias} onChange={(event) => setRouteConfig((current) => ({ ...current, alias: event.target.value }))} /></label>
          {(["chat", "code"] as const).map((profile) => <div key={profile} className="space-y-3"><h3 className="text-sm font-medium">{d[profile]}</h3><div className="grid gap-3 sm:grid-cols-3">{(["light", "standard", "advanced"] as const).map((tier) => <label key={tier} className="form-control"><span className="label-text mb-2">{d[tier]} {d.modelSuffix}</span><input className="input input-bordered" value={routeConfig[profile][tier]} onChange={(event) => updateRouteModel(profile, tier, event.target.value)} /></label>)}</div></div>)}
          <button type="button" className="btn self-start" onClick={() => void saveRouteConfig()}>{d.saveAutoRoute}</button>
        </fieldset>
      </div>
    </section>
  );
}
