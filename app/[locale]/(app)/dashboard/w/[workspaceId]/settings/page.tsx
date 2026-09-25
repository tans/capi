"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import type { Currency } from "@/lib/relay/currency";

export default function WorkspaceSettings() {
  const { workspaceId, locale } = useParams<{ workspaceId: string; locale: Locale }>();
  const router = useRouter();
  const t = getDictionary(locale).dashboard.workspace.settings;
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
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

  return (
    <div className="max-w-3xl">
      <Link className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${workspaceId}`)}>← {t.back}</Link>
      <h1 className="mt-4 text-2xl font-semibold">{t.title}</h1>
      <form onSubmit={save} className="card mt-5 border border-border bg-card">
        <div className="card-body">
          <label className="form-control"><span className="label-text mb-2">{t.name}</span><input className="input input-bordered" value={name} onChange={(event) => setName(event.target.value)} placeholder={t.placeholder} required /></label>
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
    </div>
  );
}
