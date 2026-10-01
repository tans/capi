"use client";

import * as React from "react";
import { Loader2, Mail, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Locale } from "@/lib/i18n/config";

type Settings = {
  requestTimeoutMs: number;
  autoDisableEnabled: boolean;
  pricingCurrency: { code: string; symbol: string; rate: number };
};
type Draft = {
  requestTimeoutMs: string;
  autoDisableEnabled: boolean;
  pricingCurrency: { code: string; symbol: string; rate: string };
};

async function adminRequest<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/admin/settings", { cache: "no-store", credentials: "same-origin", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : body?.error?.message || `HTTP ${response.status}`);
  if (body === null) throw new Error("The server returned an invalid response.");
  return body as T;
}

function toDraft(settings: Settings): Draft {
  return {
    requestTimeoutMs: String(settings.requestTimeoutMs),
    autoDisableEnabled: settings.autoDisableEnabled,
    pricingCurrency: { ...settings.pricingCurrency, rate: String(settings.pricingCurrency.rate) },
  };
}

export function RelaySettings({ locale }: { locale: Locale }) {
  const t = (en: string, zh: string) => locale === "zh" ? zh : en;
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saved, setSaved] = React.useState<Settings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    const controller = new AbortController();
    adminRequest<Settings>({ signal: controller.signal })
      .then((settings) => {
        if (controller.signal.aborted) return;
        setSaved(settings);
        setDraft(toDraft(settings));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const disabled = loading || saving || draft === null;
  const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(toDraft(saved));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    const timeout = Number(draft.requestTimeoutMs);
    const rate = Number(draft.pricingCurrency.rate);
    if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 600000) {
      setError(t("Timeout must be an integer from 1,000 to 600,000 ms.", "超时必须为 1,000 到 600,000 毫秒之间的整数。"));
      return;
    }
    if (!Number.isFinite(rate) || rate < 0.000001 || rate > 1_000_000) {
      setError(t("Exchange rate must be between 0.000001 and 1,000,000 units per USD.", "汇率必须在每美元 0.000001 到 1,000,000 之间。"));
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const settings = await adminRequest<Settings>({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestTimeoutMs: timeout,
          autoDisableEnabled: draft.autoDisableEnabled,
          pricingCurrency: { code: draft.pricingCurrency.code.trim().toUpperCase(), symbol: draft.pricingCurrency.symbol.trim(), rate },
        }),
      });
      setSaved(settings); setDraft(toDraft(settings));
      setNotice(t("Relay settings saved and applied.", "中转设置已保存并生效。"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setSaving(false); }
  }

  return <div className="flex flex-col gap-6">
    <div className="flex items-start gap-3"><span className="mt-0.5 flex size-9 items-center justify-center rounded-md bg-muted text-foreground"><Radio aria-hidden="true" className="size-4" /></span><div><h1 className="text-[22px] font-semibold tracking-tight">{t("System settings", "系统设置")}</h1><p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{t("Configure the Go relay behavior and system display currency.", "配置 Go 中转运行行为和系统展示币种。")}</p></div></div>
    {error && <p role="alert" className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {loading && <p role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t("Loading settings…", "正在加载设置…")}</p>}
    {draft && <form onSubmit={save} className="card card-border max-w-2xl bg-card">
      <div className="card-body gap-6 p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="relay-timeout">{t("Request timeout (ms)", "请求超时（毫秒）")}</Label><Input id="relay-timeout" type="number" min="1000" max="600000" step="1" required disabled={disabled} value={draft.requestTimeoutMs} onChange={(event) => setDraft({ ...draft, requestTimeoutMs: event.target.value })} /><p className="text-xs text-muted-foreground">{t("Changes apply to new upstream requests immediately.", "修改会立即应用于新发起的上游请求。")}</p></div>
          <div className="flex items-center gap-3 sm:pt-7"><Switch id="relay-auto-disable" checked={draft.autoDisableEnabled} disabled={disabled} onCheckedChange={(checked) => setDraft({ ...draft, autoDisableEnabled: checked })} /><Label htmlFor="relay-auto-disable">{t("Automatically disable failing channels", "自动禁用故障渠道")}</Label></div>
        </div>
        <fieldset className="space-y-3 border-t border-border pt-5"><legend className="font-medium">{t("System pricing currency", "系统计价货币")}</legend><p className="text-xs leading-relaxed text-muted-foreground">{t("Rate is display units per 1 USD. Internal balances and prices remain USD-based; this setting changes displayed amounts and price-table input/output.", "汇率表示 1 美元兑换多少展示货币。余额和内部费率仍以美元为锚；此设置会影响金额展示及价格表的输入输出。")}</p><div className="grid gap-3 sm:grid-cols-3">{(["code", "symbol", "rate"] as const).map((field) => <div className="space-y-2" key={field}><Label htmlFor={`pricing-${field}`}>{field === "code" ? t("Code", "代码") : field === "symbol" ? t("Symbol", "符号") : t("Units per USD", "每美元汇率")}</Label><Input id={`pricing-${field}`} required disabled={disabled} maxLength={field === "symbol" ? 8 : field === "code" ? 3 : undefined} type={field === "rate" ? "number" : "text"} min={field === "rate" ? "0.000001" : undefined} max={field === "rate" ? "1000000" : undefined} step={field === "rate" ? "any" : undefined} value={draft.pricingCurrency[field]} onChange={(event) => setDraft({ ...draft, pricingCurrency: { ...draft.pricingCurrency, [field]: event.target.value } })} /></div>)}</div></fieldset>
        <div className="flex justify-end border-t border-border pt-4"><Button type="submit" disabled={disabled || !dirty}>{saving ? t("Saving…", "正在保存…") : t("Save settings", "保存设置")}</Button></div>
      </div>
    </form>}
    <section className="card card-border max-w-2xl bg-card"><div className="card-body gap-2 p-5 sm:p-6"><div className="flex items-center gap-2"><Mail aria-hidden="true" className="size-4" /><h2 className="font-medium">{t("Email delivery", "邮件发送")}</h2></div><p className="text-sm leading-relaxed text-muted-foreground">{t("SMTP recovery and test-email settings are not yet available in the Go runtime. Password recovery remains unavailable until that delivery path is restored.", "Go 运行时暂未提供 SMTP 找回邮件和测试邮件设置。邮件发送链路恢复前，密码找回功能仍不可用。")}</p></div></section>
    <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{t("The Go runtime currently routes across eligible channels without a global retry-count or fallback-model-ratio setting. JEV channel selection is also managed by the Go routing policy, so unsupported legacy controls are not shown here.", "Go 运行时当前会在符合条件的渠道间进行故障切换，没有全局重试次数或兜底模型倍率设置；JEV 渠道也由 Go 路由策略管理，因此这里不展示尚不生效的旧版控件。")}</p>
  </div>;
}
