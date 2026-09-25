"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import type { Currency } from "@/lib/relay/currency";

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
  const [jev, setJev] = useState({
    autoRoutingEnabled: false,
    securityAuditEnabled: false,
  });
  const [routeConfig, setRouteConfig] =
    useState<RouteConfig>(defaultRouteConfig);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [jevMsg, setJevMsg] = useState("");
  const [system, setSystem] = useState<Currency>({ code: "USD", symbol: "$", rate: 1 });
  const [custom, setCustom] = useState(false);
  const [currency, setCurrency] = useState({ code: "USD", symbol: "$", rate: "1" });
  const [currencyMsg, setCurrencyMsg] = useState("");

  useEffect(() => {
    void fetch(`/api/workspaces/${workspaceId}`)
      .then((response) => response.json())
      .then((data) => {
        setName(data.name ?? "");
        const base: Currency = data.systemCurrency ?? { code: "USD", symbol: "$", rate: 1 };
        setSystem(base);
        setCustom(Boolean(data.displayCurrency));
        const selected: Currency = data.displayCurrency ?? base;
        setCurrency({ ...selected, rate: String(selected.rate) });
        setJev(
          data.jev ?? {
            autoRoutingEnabled: false,
            securityAuditEnabled: false,
          },
        );
        if (data.jev?.routeConfig) {
          setRouteConfig((current) => ({
            alias: data.jev.routeConfig.alias ?? "capi-auto",
            chat: {
              ...current.chat,
              ...(data.jev.routeConfig.profiles?.chat ?? {}),
            },
            code: {
              ...current.code,
              ...(data.jev.routeConfig.profiles?.code ?? {}),
            },
          }));
        }
        setCanManage(data.role === "owner" || data.role === "admin");
        setLoaded(true);
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

  async function saveCurrency(event: React.FormEvent) {
    event.preventDefault();
    setCurrencyMsg("");
    const value = custom ? { code: currency.code.trim().toUpperCase(), symbol: currency.symbol.trim(), rate: Number(currency.rate) } : null;
    if (value && (!/^[A-Z]{3}$/.test(value.code) || !value.symbol || [...value.symbol].length > 8 || !Number.isFinite(value.rate) || value.rate <= 0 || value.rate > 1_000_000)) {
      setCurrencyMsg(locale === "zh" ? "请输入三位货币代码、非空符号和有效的正数汇率。" : "Enter a three-letter code, symbol and positive rate.");
      return;
    }
    const response = await fetch(`/api/workspaces/${workspaceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayCurrency: value }) });
    setCurrencyMsg(response.ok ? (locale === "zh" ? "显示货币已保存。" : "Display currency saved.") : (locale === "zh" ? "保存失败。" : "Unable to save currency."));
    if (response.ok) router.refresh();
  }

  async function saveJev(next: Partial<typeof jev>) {
    const value = { ...jev, ...next };
    setJev(value);
    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jevAutoRoutingEnabled: value.autoRoutingEnabled,
        jevSecurityAuditEnabled: value.securityAuditEnabled,
      }),
    });
    setJevMsg(response.ok ? d.jevSaved : d.jevError);
  }

  async function saveRouteConfig() {
    const next = {
      ...routeConfig,
      alias: routeConfig.alias.trim() || "capi-auto",
    };
    setRouteConfig(next);
    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routeConfig: {
          alias: next.alias,
          profiles: {
            chat: next.chat,
            code: next.code,
            analysis: next.chat,
            sensitive: { standard: next.code.standard },
            media: { standard: next.chat.standard },
            other: { standard: next.chat.standard },
          },
          fallback: { intent: "other", complexity: "standard" },
        },
      }),
    });
    setJevMsg(response.ok ? d.jevSaved : d.jevError);
  }

  function updateRouteModel(
    profile: "chat" | "code",
    tier: "light" | "standard" | "advanced",
    value: string,
  ) {
    setRouteConfig((current) => ({
      ...current,
      [profile]: { ...current[profile], [tier]: value },
    }));
  }

  return (
    <div className="max-w-3xl">
      <Link
        className="link link-hover text-sm"
        href={localeHref(locale, `/dashboard/w/${workspaceId}`)}
      >
        ← {t.back}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{t.title}</h1>

      <form onSubmit={save} className="card mt-5 border border-border bg-card">
        <div className="card-body">
          <label className="form-control">
            <span className="label-text mb-2">{t.name}</span>
            <input
              className="input input-bordered"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.placeholder}
              required
            />
          </label>
          <button className="btn btn-primary mt-3 self-start">{t.save}</button>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        </div>
      </form>

      <form onSubmit={saveCurrency} className="card mt-5 border border-border bg-card"><div className="card-body gap-4">
        <h2 className="card-title text-base">{locale === "zh" ? "显示货币" : "Display currency"}</h2>
        <p className="text-sm text-muted-foreground">{locale === "zh" ? `默认跟随系统：${system.code}（${system.symbol}，1 USD = ${system.rate} ${system.code}）。只影响显示和金额输入，内部计费仍按 USD 额度。` : `System default: ${system.code} (${system.symbol}, 1 USD = ${system.rate} ${system.code}). Internal billing remains USD-based.`}</p>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="currency-mode" checked={!custom} disabled={!loaded || !canManage} onChange={() => setCustom(false)} />{locale === "zh" ? "跟随系统" : "Follow system"}</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="currency-mode" checked={custom} disabled={!loaded || !canManage} onChange={() => setCustom(true)} />{locale === "zh" ? "自定义" : "Custom"}</label>
        {custom && <div className="grid gap-3 sm:grid-cols-3">{(["code", "symbol", "rate"] as const).map((field) => <label key={field} className="form-control text-sm">{field === "code" ? (locale === "zh" ? "货币代码" : "Code") : field === "symbol" ? (locale === "zh" ? "符号" : "Symbol") : (locale === "zh" ? "每美元汇率" : "Units per USD")}<input className="input input-bordered mt-2" required disabled={!canManage} type={field === "rate" ? "number" : "text"} step={field === "rate" ? "any" : undefined} min={field === "rate" ? "0.000001" : undefined} maxLength={field === "symbol" ? 8 : field === "code" ? 3 : undefined} value={currency[field]} onChange={(event) => setCurrency({ ...currency, [field]: event.target.value })} /></label>)}</div>}
        <button className="btn btn-primary self-start" disabled={!loaded || !canManage}>{locale === "zh" ? "保存显示货币" : "Save currency"}</button>
        {currencyMsg && <p role="status" className="text-sm">{currencyMsg}</p>}
      </div></form>

      <section
        id="jev-controls"
        className="card mt-5 scroll-mt-28 border border-border bg-card"
      >
        <div className="card-body gap-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="card-title text-base">{d.jevTitle}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {d.jevDescription}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span
                className={`badge badge-soft ${
                  jev.autoRoutingEnabled ? "badge-success" : "badge-ghost"
                }`}
              >
                {d.jevRoute}:{" "}
                {jev.autoRoutingEnabled ? d.jevEnabled : d.jevDisabled}
              </span>
              <span
                className={`badge badge-soft ${
                  jev.securityAuditEnabled ? "badge-success" : "badge-ghost"
                }`}
              >
                {d.jevAudit}:{" "}
                {jev.securityAuditEnabled ? d.jevEnabled : d.jevDisabled}
              </span>
            </div>
          </div>

          <div className="divide-y divide-border rounded-box border border-border">
            <label
              id="jev-routing"
              className="flex items-center justify-between gap-4 p-4"
            >
              <span>
                <span className="block text-sm font-medium">{d.jevRoute}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {d.jevRouteDescription}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="peer sr-only"
                checked={jev.autoRoutingEnabled}
                disabled={!loaded || !canManage}
                onChange={(event) =>
                  void saveJev({ autoRoutingEnabled: event.target.checked })
                }
              />
              <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full border border-border bg-muted transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-[18px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:border-brand peer-checked:bg-brand peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-disabled:opacity-60" />
            </label>
            <label
              id="jev-security-audit"
              className="flex items-center justify-between gap-4 p-4"
            >
              <span>
                <span className="block text-sm font-medium">{d.jevAudit}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {d.jevAuditDescription}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="peer sr-only"
                checked={jev.securityAuditEnabled}
                disabled={!loaded || !canManage}
                onChange={(event) =>
                  void saveJev({ securityAuditEnabled: event.target.checked })
                }
              />
              <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full border border-border bg-muted transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-[18px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:border-brand peer-checked:bg-brand peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-disabled:opacity-60" />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>{d.jevReadonly}</span>
            <Link
              className="link link-hover"
              href={localeHref(
                locale,
                `/dashboard/w/${workspaceId}/routing-security`,
              )}
            >
              {d.openSecurityAudit}
            </Link>
          </div>

          {jevMsg && (
            <p
              role="status"
              className={`text-sm ${
                jevMsg === d.jevError ? "text-error" : "text-success"
              }`}
            >
              {jevMsg}
            </p>
          )}

          <fieldset
            disabled={!jev.autoRoutingEnabled || !canManage}
            className={`space-y-4 ${
              jev.autoRoutingEnabled ? "" : "opacity-50"
            }`}
          >
            <div className="border-t border-border pt-5">
              <h3 className="text-sm font-medium">{d.autoRoute}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {jev.autoRoutingEnabled
                  ? d.autoRouteDescription
                  : d.enableRoutingToConfigure}
              </p>
            </div>
            <label className="form-control">
              <span className="label-text mb-2">{d.routeName}</span>
              <input
                className="input input-bordered"
                value={routeConfig.alias}
                onChange={(event) =>
                  setRouteConfig((current) => ({
                    ...current,
                    alias: event.target.value,
                  }))
                }
              />
            </label>
            {(["chat", "code"] as const).map((profile) => (
              <div key={profile} className="space-y-3">
                <h4 className="text-sm font-medium">{d[profile]}</h4>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["light", "standard", "advanced"] as const).map((tier) => (
                    <label key={tier} className="form-control">
                      <span className="label-text mb-2">
                        {d[tier]} {d.modelSuffix}
                      </span>
                      <input
                        className="input input-bordered"
                        value={routeConfig[profile][tier]}
                        onChange={(event) =>
                          updateRouteModel(profile, tier, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn self-start"
              onClick={() => void saveRouteConfig()}
            >
              {d.saveAutoRoute}
            </button>
          </fieldset>
        </div>
      </section>
    </div>
  );
}
