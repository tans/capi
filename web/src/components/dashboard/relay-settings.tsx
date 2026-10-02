"use client";

import * as React from "react";
import { Loader2, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Locale } from "@/lib/i18n/config";
import { EmailSettings } from "@/components/dashboard/email-settings";
import { ProductAnnouncements } from "@/components/dashboard/product-announcements";

type Settings = {
  addr: string;
  publicBaseUrl: string;
  trustedOrigins: string[];
  adminEmail: string;
  jevUrl: string;
  alertWebhookUrl: string;
  backupRetention: number;
  logLevel: string;
  redact: boolean;
  codexVersion: string;
  requestTimeoutMs: number;
  autoDisableEnabled: boolean;
  pricingCurrency: { code: string; symbol: string; rate: number };
};
type Draft = {
  addr: string;
  publicBaseUrl: string;
  trustedOrigins: string;
  adminEmail: string;
  jevUrl: string;
  alertWebhookUrl: string;
  backupRetention: string;
  logLevel: string;
  redact: boolean;
  codexVersion: string;
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
    addr: settings.addr,
    publicBaseUrl: settings.publicBaseUrl,
    trustedOrigins: settings.trustedOrigins.join("\n"),
    adminEmail: settings.adminEmail,
    jevUrl: settings.jevUrl,
    alertWebhookUrl: settings.alertWebhookUrl,
    backupRetention: String(settings.backupRetention),
    logLevel: settings.logLevel,
    redact: settings.redact,
    codexVersion: settings.codexVersion,
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
    const retention = Number(draft.backupRetention);
    if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 600000) {
      setError(t("Timeout must be an integer from 1,000 to 600,000 ms.", "超时必须为 1,000 到 600,000 毫秒之间的整数。"));
      return;
    }
    if (!Number.isFinite(rate) || rate < 0.000001 || rate > 1_000_000) {
      setError(t("Exchange rate must be between 0.000001 and 1,000,000 units per USD.", "汇率必须在每美元 0.000001 到 1,000,000 之间。"));
      return;
    }
    if (!Number.isSafeInteger(retention) || retention < 1 || retention > 100000) {
      setError(t("Backup retention must be an integer from 1 to 100,000.", "备份保留数量必须为 1 到 100,000 之间的整数。"));
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const settings = await adminRequest<Settings>({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addr: draft.addr.trim(),
          publicBaseUrl: draft.publicBaseUrl.trim(),
          trustedOrigins: draft.trustedOrigins.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
          adminEmail: draft.adminEmail.trim(),
          jevUrl: draft.jevUrl.trim(),
          alertWebhookUrl: draft.alertWebhookUrl.trim(),
          backupRetention: retention,
          logLevel: draft.logLevel,
          redact: draft.redact,
          codexVersion: draft.codexVersion.trim(),
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
          <div className="space-y-2"><Label htmlFor="system-addr">{t("Listen address", "监听地址")}</Label><Input id="system-addr" required disabled={disabled} value={draft.addr} onChange={(event) => setDraft({ ...draft, addr: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="system-public-url">{t("Public base URL", "对外访问地址")}</Label><Input id="system-public-url" type="url" required disabled={disabled} value={draft.publicBaseUrl} onChange={(event) => setDraft({ ...draft, publicBaseUrl: event.target.value })} /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="system-origins">{t("Trusted origins", "可信来源")}</Label><textarea id="system-origins" required disabled={disabled} value={draft.trustedOrigins} onChange={(event) => setDraft({ ...draft, trustedOrigins: event.target.value })} className="textarea textarea-bordered min-h-20 w-full" /><p className="text-xs text-muted-foreground">{t("One origin per line.", "每行填写一个来源地址。")}</p></div>
          <div className="space-y-2"><Label htmlFor="system-admin-email">{t("Initial admin email", "初始管理员邮箱")}</Label><Input id="system-admin-email" type="email" disabled={disabled} value={draft.adminEmail} onChange={(event) => setDraft({ ...draft, adminEmail: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="system-backup-retention">{t("Backup retention", "备份保留数量")}</Label><Input id="system-backup-retention" type="number" min="1" max="100000" step="1" required disabled={disabled} value={draft.backupRetention} onChange={(event) => setDraft({ ...draft, backupRetention: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="system-jev-url">JEV URL</Label><Input id="system-jev-url" type="url" disabled={disabled} value={draft.jevUrl} onChange={(event) => setDraft({ ...draft, jevUrl: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="system-alert-url">{t("Alert webhook URL", "告警 Webhook 地址")}</Label><Input id="system-alert-url" type="url" disabled={disabled} value={draft.alertWebhookUrl} onChange={(event) => setDraft({ ...draft, alertWebhookUrl: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="system-log-level">{t("Log level", "日志级别")}</Label><select id="system-log-level" disabled={disabled} value={draft.logLevel} onChange={(event) => setDraft({ ...draft, logLevel: event.target.value })} className="select select-bordered w-full"><option value="debug">debug</option><option value="info">info</option><option value="warn">warn</option><option value="error">error</option></select></div>
          <div className="space-y-2"><Label htmlFor="system-codex-version">{t("Codex client version", "Codex 客户端版本")}</Label><Input id="system-codex-version" required disabled={disabled} value={draft.codexVersion} onChange={(event) => setDraft({ ...draft, codexVersion: event.target.value })} /></div>
          <div className="flex items-center gap-3 sm:pt-7"><Switch id="system-redact" checked={draft.redact} disabled={disabled} onCheckedChange={(checked) => setDraft({ ...draft, redact: checked })} /><Label htmlFor="system-redact">{t("Redact sensitive request data", "脱敏请求中的敏感数据")}</Label></div>
        </div>
        <div className="border-t border-border pt-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="relay-timeout">{t("Request timeout (ms)", "请求超时（毫秒）")}</Label><Input id="relay-timeout" type="number" min="1000" max="600000" step="1" required disabled={disabled} value={draft.requestTimeoutMs} onChange={(event) => setDraft({ ...draft, requestTimeoutMs: event.target.value })} /><p className="text-xs text-muted-foreground">{t("Changes apply to new upstream requests immediately.", "修改会立即应用于新发起的上游请求。")}</p></div>
          <div className="flex items-center gap-3 sm:pt-7"><Switch id="relay-auto-disable" checked={draft.autoDisableEnabled} disabled={disabled} onCheckedChange={(checked) => setDraft({ ...draft, autoDisableEnabled: checked })} /><Label htmlFor="relay-auto-disable">{t("Automatically disable failing channels", "自动禁用故障渠道")}</Label></div>
        </div>
        <fieldset className="space-y-3 border-t border-border pt-5"><legend className="font-medium">{t("System pricing currency", "系统计价货币")}</legend><p className="text-xs leading-relaxed text-muted-foreground">{t("Rate is display units per 1 USD. Internal balances and prices remain USD-based; this setting changes displayed amounts and price-table input/output.", "汇率表示 1 美元兑换多少展示货币。余额和内部费率仍以美元为锚；此设置会影响金额展示及价格表的输入输出。")}</p><div className="grid gap-3 sm:grid-cols-3">{(["code", "symbol", "rate"] as const).map((field) => <div className="space-y-2" key={field}><Label htmlFor={`pricing-${field}`}>{field === "code" ? t("Code", "代码") : field === "symbol" ? t("Symbol", "符号") : t("Units per USD", "每美元汇率")}</Label><Input id={`pricing-${field}`} required disabled={disabled} maxLength={field === "symbol" ? 8 : field === "code" ? 3 : undefined} type={field === "rate" ? "number" : "text"} min={field === "rate" ? "0.000001" : undefined} max={field === "rate" ? "1000000" : undefined} step={field === "rate" ? "any" : undefined} value={draft.pricingCurrency[field]} onChange={(event) => setDraft({ ...draft, pricingCurrency: { ...draft.pricingCurrency, [field]: event.target.value } })} /></div>)}</div></fieldset>
        <div className="flex justify-end border-t border-border pt-4"><Button type="submit" disabled={disabled || !dirty}>{saving ? t("Saving…", "正在保存…") : t("Save settings", "保存设置")}</Button></div>
        </div>
      </div>
    </form>}
    <EmailSettings locale={locale} />
    <ProductAnnouncements locale={locale} />
    <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{t("The Go runtime currently routes across eligible channels without a global retry-count or fallback-model-ratio setting. JEV channel selection is also managed by the Go routing policy, so unsupported legacy controls are not shown here.", "Go 运行时当前会在符合条件的渠道间进行故障切换，没有全局重试次数或兜底模型倍率设置；JEV 渠道也由 Go 路由策略管理，因此这里不展示尚不生效的旧版控件。")}</p>
  </div>;
}
