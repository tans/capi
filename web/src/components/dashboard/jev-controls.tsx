"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

export default function WorkspaceJevControls({ workspaceId, locale }: { workspaceId: string; locale: Locale }) {
  const d = getDictionary(locale).dashboard.components.settings;
  const [jev, setJev] = useState({ autoRoutingEnabled: false, securityAuditEnabled: false });
  const [routeConfig, setRouteConfig] = useState<RouteConfig>(defaultRouteConfig);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [jevMsg, setJevMsg] = useState("");
  const [autoRoutingBusy, setAutoRoutingBusy] = useState(false);
  const [securityAuditBusy, setSecurityAuditBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setRouteConfig(defaultRouteConfig);
    setJev({ autoRoutingEnabled: false, securityAuditEnabled: false });
    setCanManage(false);
    setLoadError(false);
    void fetch(`/api/workspaces/${workspaceId}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load workspace settings");
        return response.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setJev(data.jev ?? { autoRoutingEnabled: false, securityAuditEnabled: false });
        if (data.jev?.routeConfig) {
          setRouteConfig(() => ({
            alias: data.jev.routeConfig.alias ?? "capi-auto",
            chat: { ...defaultRouteConfig.chat, ...(data.jev.routeConfig.profiles?.chat ?? {}) },
            code: { ...defaultRouteConfig.code, ...(data.jev.routeConfig.profiles?.code ?? {}) },
          }));
        }
        setCanManage(data.workspace?.role === "owner" || data.workspace?.role === "admin");
        setLoaded(true);
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); });
    return () => controller.abort();
  }, [workspaceId]);

  async function saveRouteConfig() {
    const next = { ...routeConfig, alias: routeConfig.alias.trim() || "capi-auto" };
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeConfig: { alias: next.alias, profiles: { chat: next.chat, code: next.code, analysis: next.chat, sensitive: { standard: next.code.standard }, media: { standard: next.chat.standard }, other: { standard: next.chat.standard } }, fallback: { intent: "other", complexity: "standard" } } }),
      });
      if (!response.ok) throw new Error(d.jevError);
      setRouteConfig(next);
      setJevMsg(d.jevSaved);
    } catch { setJevMsg(d.jevError); }
  }

  async function toggleAutoRouting(enabled: boolean) {
    if (!canManage || autoRoutingBusy) return;
    setAutoRoutingBusy(true);
    setJevMsg("");
    try {
    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jevAutoRoutingEnabled: enabled }),
    });
    if (response.ok) {
      setJev((current) => ({ ...current, autoRoutingEnabled: enabled }));
      setJevMsg(d.jevSaved);
      window.dispatchEvent(new Event("capi:refresh"));
    } else {
      setJevMsg(d.jevError);
    }
    } catch { setJevMsg(d.jevError); }
    finally { setAutoRoutingBusy(false); }
  }

  async function toggleSecurityAudit(enabled: boolean) {
    if (!canManage || securityAuditBusy) return;
    setSecurityAuditBusy(true);
    setJevMsg("");
    try {
    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jevSecurityAuditEnabled: enabled }),
    });
    if (response.ok) {
      setJev((current) => ({ ...current, securityAuditEnabled: enabled }));
      setJevMsg(d.jevSaved);
      window.dispatchEvent(new Event("capi:refresh"));
    } else {
      setJevMsg(d.jevError);
    }
    } catch { setJevMsg(d.jevError); }
    finally { setSecurityAuditBusy(false); }
  }

  function updateRouteModel(profile: "chat" | "code", tier: "light" | "standard" | "advanced", value: string) {
    setRouteConfig((current) => ({ ...current, [profile]: { ...current[profile], [tier]: value } }));
  }

  return (
    <section id="jev-controls" className="card scroll-mt-28 border border-border bg-card">
      <div className="card-body gap-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div><h1 className="text-[22px] font-semibold tracking-tight">{d.jevTitle}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{d.jevDescription}</p><p className="mt-2 max-w-2xl text-xs text-warning">{locale === "zh" ? "自动路由和本地输入安全审计均已接入 Go；当前审计使用本地规则，不调用外部 JEV。" : "Automatic routing and local input auditing now run in Go. Auditing uses local rules and does not call an external JEV service."}</p></div>
          <span className={`badge badge-soft ${jev.autoRoutingEnabled ? "badge-success" : "badge-ghost"}`}>{d.jevRoute}: {jev.autoRoutingEnabled ? d.jevEnabled : d.jevDisabled}</span>
        </div>
        <div className="divide-y divide-border rounded-box border border-border">
          <div id="jev-routing" className="flex items-center justify-between gap-4 p-4"><span><span className="block text-sm font-medium">{d.jevRoute}</span><span className="mt-1 block text-xs text-muted-foreground">{locale === "zh" ? "使用路由别名请求时，按输入长度和内容选择已配置且可用的模型。" : "Requests using the route alias select a configured, available model from the request text."}</span></span><input type="checkbox" className="toggle" checked={jev.autoRoutingEnabled} disabled={!loaded || !canManage || autoRoutingBusy} onChange={(event) => void toggleAutoRouting(event.target.checked)} aria-label={d.jevRoute} /></div>
          <div id="jev-security-audit" className="flex items-center justify-between gap-4 p-4"><span><span className="block text-sm font-medium">{d.jevAudit}</span><span className="mt-1 block text-xs text-muted-foreground">{locale === "zh" ? "记录凭据、个人信息和机密内容风险；证据会脱敏，保存 90 天。" : "Records credential, personal-data and confidential-content risks. Evidence is masked and retained for 90 days."}</span></span><input type="checkbox" className="toggle" checked={jev.securityAuditEnabled} disabled={!loaded || !canManage || securityAuditBusy} onChange={(event) => void toggleSecurityAudit(event.target.checked)} aria-label={d.jevAudit} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><span>{d.jevReadonly}</span><Link className="link link-hover" href={localeHref(locale, `/dashboard/w/${workspaceId}/routing-security#jev-security-audit`)}>{d.jevAudit}</Link></div>
        {loadError && <p role="alert" className="text-sm text-error">{locale === "zh" ? "工作区设置加载失败，请刷新页面重试。" : "Unable to load workspace settings. Refresh the page to retry."}</p>}
        {jevMsg && <p role="status" className={`text-sm ${jevMsg === d.jevError ? "text-error" : "text-success"}`}>{jevMsg}</p>}
        <fieldset disabled={!loaded || !canManage} className="space-y-4">
          <div className="border-t border-border pt-5"><h2 className="text-sm font-medium">{d.autoRoute}</h2><p className="mt-1 text-xs text-muted-foreground">{locale === "zh" ? "维护路由别名与模型档位。开启自动路由后，保存的配置会参与 Chat 和 Responses 请求。" : "Maintain the route alias and model tiers. When automatic routing is enabled, these profiles apply to Chat and Responses requests."}</p></div>
          <label className="form-control"><span className="label-text mb-2">{d.routeName}</span><input className="input input-bordered" value={routeConfig.alias} onChange={(event) => setRouteConfig((current) => ({ ...current, alias: event.target.value }))} /></label>
          {(["chat", "code"] as const).map((profile) => <div key={profile} className="space-y-3"><h3 className="text-sm font-medium">{d[profile]}</h3><div className="grid gap-3 sm:grid-cols-3">{(["light", "standard", "advanced"] as const).map((tier) => <label key={tier} className="form-control"><span className="label-text mb-2">{d[tier]} {d.modelSuffix}</span><input className="input input-bordered" value={routeConfig[profile][tier]} onChange={(event) => updateRouteModel(profile, tier, event.target.value)} /></label>)}</div></div>)}
          <button type="button" className="btn self-start" onClick={() => void saveRouteConfig()}>{d.saveAutoRoute}</button>
        </fieldset>
      </div>
    </section>
  );
}
