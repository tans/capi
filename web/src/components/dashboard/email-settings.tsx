"use client";

import * as React from "react";
import { Check, Loader2, Mail, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/lib/i18n/config";

type EmailSettings = {
  smtpHost: string;
  smtpPort: number;
  security: "ssl" | "starttls" | "none";
  smtpUser: string;
  fromName: string;
  fromAddress: string;
  passwordConfigured: boolean;
  updatedAt: number | null;
};

type Draft = Omit<EmailSettings, "passwordConfigured" | "updatedAt" | "smtpPort"> & {
  smtpPort: string;
  smtpPassword: string;
};

async function emailRequest<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/admin/email-settings", {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  if (body === null) throw new Error("The server returned an invalid response.");
  return body as T;
}

function toDraft(settings: EmailSettings): Draft {
  return {
    smtpHost: settings.smtpHost,
    smtpPort: String(settings.smtpPort),
    security: settings.security,
    smtpUser: settings.smtpUser,
    fromName: settings.fromName,
    fromAddress: settings.fromAddress,
    smtpPassword: "",
  };
}

export function EmailSettings({ locale }: { locale: Locale }) {
  const t = (en: string, zh: string) => locale === "zh" ? zh : en;
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saved, setSaved] = React.useState<EmailSettings | null>(null);
  const [testRecipient, setTestRecipient] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    const controller = new AbortController();
    emailRequest<EmailSettings>({ signal: controller.signal })
      .then((settings) => {
        if (controller.signal.aborted) return;
        setSaved(settings);
        setDraft(toDraft(settings));
        setTestRecipient(settings.smtpUser);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await emailRequest<EmailSettings>({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, smtpPort: Number(draft.smtpPort) }),
      });
      setSaved(result);
      setDraft(toDraft(result));
      if (!testRecipient) setTestRecipient(result.smtpUser);
      setNotice(t("Email settings saved.", "邮件设置已保存。"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (sending) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      await emailRequest<{ success: true }>({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testRecipient }),
      });
      setNotice(t(`Test email sent to ${testRecipient}.`, `测试邮件已发送至 ${testRecipient}。`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }

  const disabled = loading || saving;
  const dirty = draft && saved && (!saved.updatedAt || JSON.stringify({ ...draft, smtpPassword: "" }) !== JSON.stringify({ ...toDraft(saved), smtpPassword: "" }));

  return <section className="card card-border max-w-3xl">
    <div className="card-body gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 items-center justify-center rounded-md bg-muted text-foreground"><Mail aria-hidden="true" className="size-4" /></span>
          <div>
            <h2 className="card-title text-base">{t("Email delivery", "邮件发送")}</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{t("Configure the account for administrator test messages. Password recovery can use it after that flow is restored. Credentials are encrypted and never displayed after saving.", "配置管理员测试邮件使用的账号。密码找回流程恢复后也可使用此账号。凭据会加密保存，保存后不会再次显示。")}</p>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">{t("Use SSL/TLS or STARTTLS whenever the provider supports it. With no transport encryption, Go permits password authentication only to localhost.", "服务商支持时请使用 SSL/TLS 或 STARTTLS。未启用传输加密时，Go 仅允许向 localhost 发送密码认证。")}</p>
          </div>
        </div>
        {saved?.passwordConfigured && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"><Check aria-hidden="true" className="size-3.5" />{t("Configured", "已配置")}</span>}
      </div>

      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-emerald-700/20 bg-emerald-700/5 px-3 py-2.5 text-sm text-emerald-800">{notice}</p>}
      {loading && <div aria-label={t("Loading email settings", "正在加载邮件设置")} className="space-y-3 py-1" role="status"><div className="h-9 animate-pulse rounded-md bg-muted" /><div className="grid gap-4 sm:grid-cols-2"><div className="h-9 animate-pulse rounded-md bg-muted" /><div className="h-9 animate-pulse rounded-md bg-muted" /></div></div>}

      {draft && <>
        <form onSubmit={save} className="space-y-5">
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="smtp-host">{t("SMTP host", "SMTP 服务器")}</Label><Input className="input" id="smtp-host" autoComplete="off" required disabled={disabled} value={draft.smtpHost} onChange={(event) => update("smtpHost", event.target.value)} /></div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3">
              <div className="space-y-2"><Label htmlFor="smtp-port">{t("Port", "端口")}</Label><Input className="input" id="smtp-port" type="number" min="1" max="65535" required disabled={disabled} value={draft.smtpPort} onChange={(event) => update("smtpPort", event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="smtp-security">{t("Connection security", "连接加密")}</Label><select className="select w-full" id="smtp-security" disabled={disabled} value={draft.security} onChange={(event) => update("security", event.target.value as Draft["security"])}><option value="ssl">{t("SSL / TLS", "SSL / TLS")}</option><option value="starttls">STARTTLS</option><option value="none">{t("None", "不加密")}</option></select></div>
            </div>
            <div className="space-y-2"><Label htmlFor="smtp-user">{t("SMTP account", "SMTP 账号")}</Label><Input className="input" id="smtp-user" type="email" autoComplete="username" required disabled={disabled} value={draft.smtpUser} onChange={(event) => update("smtpUser", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="smtp-password">{t("Authorization code", "SMTP 授权码")}</Label><Input className="input" id="smtp-password" type="password" autoComplete="new-password" disabled={disabled} value={draft.smtpPassword} placeholder={saved?.passwordConfigured ? t("Saved — leave blank to keep it", "已保存，留空则不修改") : t("Enter your SMTP authorization code", "输入 SMTP 授权码")} onChange={(event) => update("smtpPassword", event.target.value)} /><p className="text-xs text-muted-foreground">{t("Use the provider's SMTP authorization code, not your account password.", "填写邮箱服务商提供的 SMTP 授权码，不是邮箱登录密码。")}</p></div>
            <div className="space-y-2"><Label htmlFor="smtp-from-name">{t("Sender name", "发件人名称")}</Label><Input className="input" id="smtp-from-name" required maxLength={100} disabled={disabled} value={draft.fromName} onChange={(event) => update("fromName", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="smtp-from-address">{t("Sender address", "发件地址")}</Label><Input className="input" id="smtp-from-address" type="email" required disabled={disabled} value={draft.fromAddress} onChange={(event) => update("fromAddress", event.target.value)} /></div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button className="btn" type="submit" disabled={disabled || (!dirty && !draft.smtpPassword)}>{saving ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t("Saving…", "正在保存…")}</> : t("Save email settings", "保存邮件设置")}</Button>
            {saved?.passwordConfigured && <span className="text-xs text-muted-foreground">{t("Password changes only when a new code is entered.", "只有输入新的授权码时才会更新密码。")}</span>}
          </div>
        </form>

        <div className="grid gap-3 border-t border-border pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2"><Label htmlFor="smtp-test-to">{t("Test recipient", "测试收件地址")}</Label><Input className="input" id="smtp-test-to" type="email" autoComplete="email" required disabled={!saved?.passwordConfigured || sending} value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder={t("name@example.com", "name@example.com")} /><p className="text-xs text-muted-foreground">{t("Test messages use the last saved settings.", "测试邮件使用最近一次保存的设置。")}</p></div>
          <Button className="btn" type="button" variant="outline" disabled={!saved?.passwordConfigured || sending || !testRecipient} onClick={() => void sendTest()}>{sending ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t("Sending…", "正在发送…")}</> : <><Send aria-hidden="true" className="size-4" />{t("Send test email", "发送测试邮件")}</>}</Button>
        </div>
      </>
      }
    </div>
  </section>;
}
