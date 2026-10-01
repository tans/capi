"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useResource } from "@/api";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
type Dict = Dictionary["dashboard"]["settings"];


type NotificationItem = {
  id: string;
  titleKey: keyof Dict;
  bodyKey: keyof Dict;
  defaultOn: boolean;
  available: boolean;
};

const notificationDefs: NotificationItem[] = [
  {
    id: "budget",
    titleKey: "notifyBudget",
    bodyKey: "notifyBudgetBody",
    defaultOn: true,
    available: true,
  },
  {
    id: "failed",
    titleKey: "notifyTaskFailed",
    bodyKey: "notifyTaskFailedBody",
    defaultOn: true,
    available: true,
  },
  {
    id: "weekly",
    titleKey: "notifyWeekly",
    bodyKey: "notifyWeeklyBody",
    defaultOn: false,
    available: true,
  },
  {
    id: "product",
    titleKey: "notifyProduct",
    bodyKey: "notifyProductBody",
    defaultOn: false,
    available: true,
  },
];


type StoredSettings = {
  notifications: Record<string, boolean>;
  savedAt: string | null;
};

function defaultState(): StoredSettings {
  return {
    notifications: Object.fromEntries(notificationDefs.map((n) => [n.id, n.defaultOn])),
    savedAt: null,
  };
}

function formatRelative(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "";
  const diffMs = target - Date.now();
  const formatter = new Intl.RelativeTimeFormat(
    locale === "zh" ? "zh-CN" : "en",
    { numeric: "auto" },
  );
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  if (abs < 60_000) return formatter.format(0, "second");
  if (abs < 3_600_000) return formatter.format(minutes, "minute");
  if (abs < 86_400_000) return formatter.format(hours, "hour");
  return formatter.format(Math.round(diffMs / 86_400_000), "day");
}

export function SettingsForm({
  dict,
  locale,
}: {
  dict: Dict;
  locale: Locale;
}) {
  const [state, setState] = React.useState<StoredSettings>(defaultState);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [, forceTick] = React.useReducer((n: number) => n + 1, 0);
  const [now, setNow] = React.useState(() => Date.now());
  const account = useResource<{ name: string; email: string }>("/api/user/account");
  React.useEffect(() => { void fetch("/api/user/settings").then(async (r) => { if (!r.ok) throw new Error("Unable to load settings"); const data = await r.json() as Partial<StoredSettings>; setState((current) => ({ ...current, notifications: { ...current.notifications, ...(data.notifications ?? {}) } })); setSavedAt(data.savedAt ?? null); }).catch(() => undefined); }, []);
  React.useEffect(() => { if (!savedAt) return; const id = window.setInterval(() => { setNow(Date.now()); forceTick(); }, 30_000); return () => window.clearInterval(id); }, [savedAt]);
  const [saveError, setSaveError] = React.useState(false);
  const save = async (notifications: Record<string, boolean>) => { setSaveError(false); try { const response = await fetch("/api/user/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ notifications }) }); if (!response.ok) throw new Error("Unable to save settings"); const data = await response.json() as { savedAt?: string }; setSavedAt(data.savedAt ?? new Date().toISOString()); setNow(+new Date()); } catch { setSaveError(true); } };
  const handleToggle = (id: string, checked: boolean) => { const next = { ...state.notifications, [id]: checked }; setState({ notifications: next, savedAt: state.savedAt }); void save(next); };


  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          {dict.title}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {dict.description}
        </p>
      </div>

      <div className="rounded-md border border-border bg-card p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          {dict.account}
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {dict.accountDescription}
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="org">{dict.accountName}</Label>
            <Input id="org" value={account.data?.name ?? ""} readOnly />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{dict.accountEmail}</Label>
            <Input id="email" type="email" value={account.data?.email ?? ""} readOnly />
          </div>
        </div>
        <div className="mt-6 flex items-center gap-4">
          <span className="text-[12px] text-muted-foreground">{locale === "zh" ? "资料由账户管理页维护。" : "Profile details are managed on the account page."}</span>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          {dict.notifications}
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground">{locale === "zh" ? "失败请求、预算阈值、周报和产品通知会在配置 SMTP 后发送。" : "Failed-request, budget-threshold, weekly digest, and product notification emails use configured SMTP."}</p>
        <div className="mt-5 flex flex-col divide-y divide-border">
          {notificationDefs.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0"
            >
              <div>
                <p className="text-[14px] font-medium text-foreground">
                  {dict[item.titleKey]}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {dict[item.bodyKey]}
                  {!item.available && <span className="ml-2 text-warning">{locale === "zh" ? "（暂未提供）" : "(not available yet)"}</span>}
                </p>
              </div>
              <Switch
                checked={state.notifications[item.id]}
                disabled={!item.available}
                onCheckedChange={(checked) => handleToggle(item.id, checked)}
                aria-label={dict[item.titleKey]}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-4">
          {saveError && <span role="alert" className="text-sm text-error">{locale === "zh" ? "保存失败，请重试。" : "Save failed. Please retry."}</span>}
          {savedAt && now ? (
            <span className="text-[12px] text-muted-foreground">
              {dict.saved} · {formatRelative(savedAt, locale)}
            </span>
          ) : null}
        </div>
      </div>

    </div>
  );
}
