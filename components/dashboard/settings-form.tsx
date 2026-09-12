"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type Dict = Dictionary["dashboard"]["settings"];

type NotificationItem = {
  id: string;
  titleKey: keyof Dict;
  bodyKey: keyof Dict;
  defaultOn: boolean;
};

const notificationDefs: NotificationItem[] = [
  {
    id: "budget",
    titleKey: "notifyBudget",
    bodyKey: "notifyBudgetBody",
    defaultOn: true,
  },
  {
    id: "failed",
    titleKey: "notifyTaskFailed",
    bodyKey: "notifyTaskFailedBody",
    defaultOn: true,
  },
  {
    id: "weekly",
    titleKey: "notifyWeekly",
    bodyKey: "notifyWeeklyBody",
    defaultOn: false,
  },
  {
    id: "product",
    titleKey: "notifyProduct",
    bodyKey: "notifyProductBody",
    defaultOn: false,
  },
];


type StoredSettings = {
  accountName: string;
  accountEmail: string;
  notifications: Record<string, boolean>;
  savedAt: string | null;
};

function defaultState(): StoredSettings {
  return {
    accountName: "",
    accountEmail: "",
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
  const accountNameRef = React.useRef<HTMLInputElement | null>(null);
  const accountEmailRef = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => { void fetch("/api/user/settings").then(async (r) => { if (!r.ok) throw new Error("Unable to load settings"); const data = await r.json() as Partial<StoredSettings>; setState((current) => ({ ...current, ...data, notifications: { ...current.notifications, ...(data.notifications ?? {}) } })); setSavedAt(data.savedAt ?? null); }).catch(() => undefined); }, []);
  React.useEffect(() => { if (!savedAt) return; const id = window.setInterval(() => { setNow(Date.now()); forceTick(); }, 30_000); return () => window.clearInterval(id); }, [savedAt]);
  const save = async (next: StoredSettings) => { const response = await fetch("/api/user/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }); if (response.ok) { const data = await response.json() as { savedAt?: string }; setSavedAt(data.savedAt ?? new Date().toISOString()); setNow(+new Date()); } };
  const handleToggle = (id: string, checked: boolean) => { const next = { ...state, notifications: { ...state.notifications, [id]: checked } }; setState(next); void save(next); };
  const handleSaveAccount = () => { const next = { ...state, accountName: accountNameRef.current?.value ?? state.accountName, accountEmail: accountEmailRef.current?.value ?? state.accountEmail }; setState(next); void save(next); };
  const handleSavePrefs = () => { void save(state); };


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
            <Input
              id="org"
              ref={accountNameRef}
              key={`name-${state.accountName}`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{dict.accountEmail}</Label>
            <Input
              id="email"
              type="email"
              ref={accountEmailRef}
              key={`email-${state.accountEmail}`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="account">{dict.accountId}</Label>
            <Input id="account" defaultValue="acct_4821" readOnly />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan">{dict.plan}</Label>
            <Input id="plan" defaultValue={dict.planValue} readOnly />
          </div>
        </div>
        <div className="mt-6 flex items-center gap-4">
          <Button variant="brand" onClick={handleSaveAccount}>
            {dict.save}
          </Button>
          {savedAt && now ? (
            <span className="text-[12px] text-muted-foreground">
              {dict.saved} · {formatRelative(savedAt, locale)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          {dict.notifications}
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {dict.notificationsDescription}
        </p>
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
                </p>
              </div>
              <Switch
                checked={state.notifications[item.id]}
                onCheckedChange={(checked) => handleToggle(item.id, checked)}
                aria-label={dict[item.titleKey]}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-4">
          <Button variant="brand" onClick={handleSavePrefs}>
            {dict.save}
          </Button>
          {savedAt && now ? (
            <span className="text-[12px] text-muted-foreground">
              {dict.saved} · {formatRelative(savedAt, locale)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-destructive/30 bg-card p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          {dict.danger}
        </h2>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          {dict.dangerDescription}
        </p>
        <Button
          variant="outline"
          className="mt-5 border-destructive/40 text-destructive"
        >
          {dict.closeAccount}
        </Button>
      </div>
    </div>
  );
}
