"use client";

import * as React from "react";
import { Loader2, Megaphone, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/lib/i18n/config";

type Announcement = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  publishedBy: string;
  recipients: number;
  delivered: number;
  pending: number;
  suppressed: number;
};

async function request<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/admin/product-announcements", {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  if (body === null) throw new Error("The server returned an invalid response.");
  return body as T;
}

export function ProductAnnouncements({ locale }: { locale: Locale }) {
  const t = (en: string, zh: string) => locale === "zh" ? zh : en;
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [publishing, setPublishing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    const controller = new AbortController();
    request<{ announcements: Announcement[] }>({ signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setAnnouncements(result.announcements); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (publishing) return;
    setPublishing(true);
    setError("");
    setNotice("");
    try {
      const created = await request<Announcement>({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      setAnnouncements((current) => [created, ...current].slice(0, 20));
      setTitle("");
      setBody("");
      setNotice(t(`${created.recipients} email notifications queued.`, `已加入 ${created.recipients} 封通知邮件。`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPublishing(false);
    }
  }

  const formatter = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" });

  return <section className="card card-border max-w-3xl bg-card">
    <div className="card-body gap-5 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 items-center justify-center rounded-md bg-muted text-foreground"><Megaphone aria-hidden="true" className="size-4" /></span>
        <div>
          <h2 className="card-title text-base">{t("Product announcements", "产品公告")}</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{t("Publish plain-text updates to users who have enabled product notifications. Delivery uses the configured SMTP account.", "发布纯文本产品通知给已开启产品动态的用户。邮件通过已配置的 SMTP 账号发送。")}</p>
        </div>
      </div>

      {error && <p role="alert" className="rounded-md border border-destructive/30 px-3 py-2.5 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}

      <form onSubmit={publish} className="space-y-4 border-t border-border pt-5">
        <div className="space-y-2">
          <Label htmlFor="announcement-title">{t("Title", "标题")}</Label>
          <Input id="announcement-title" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} disabled={publishing} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="announcement-body">{t("Message", "正文")}</Label>
          <Textarea id="announcement-body" required maxLength={10000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} disabled={publishing} />
          <p className="text-xs text-muted-foreground">{t("Plain text, up to 10,000 characters.", "纯文本，最多 10,000 个字符。")}</p>
        </div>
        <div className="flex justify-end border-t border-border pt-4">
          <Button type="submit" disabled={publishing || loading || !title.trim() || !body.trim()}>{publishing ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t("Publishing…", "正在发布…")}</> : <><Send aria-hidden="true" className="size-4" />{t("Publish announcement", "发布公告")}</>}</Button>
        </div>
      </form>

      <div className="border-t border-border pt-5">
        <h3 className="text-sm font-medium">{t("Recent announcements", "最近公告")}</h3>
        {loading && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{t("Loading…", "正在加载…")}</p>}
        {!loading && announcements.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t("No announcements published.", "尚未发布公告。")}</p>}
        <div className="mt-3 divide-y divide-border">
          {announcements.map((item) => <article key={item.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h4 className="text-sm font-medium">{item.title}</h4>
              <time className="text-xs text-muted-foreground" dateTime={item.publishedAt}>{formatter.format(new Date(item.publishedAt))}</time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.body}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t("Email status", "邮件状态")}: {item.delivered}/{item.recipients} {t("sent", "已发送")}, {item.pending} {t("pending", "待处理")}{item.suppressed > 0 ? `, ${item.suppressed} ${t("suppressed", "已跳过")}` : ""}</p>
          </article>)}
        </div>
      </div>
    </div>
  </section>;
}
