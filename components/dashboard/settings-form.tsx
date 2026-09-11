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

const STORAGE_KEY = "capi:dashboard:settings";

type StoredSettings = {
  accountName: string;
  accountEmail: string;
  notifications: Record<string, boolean>;
  savedAt: string | null;
};

function defaultState(): StoredSettings {
  return {
    accountName: "Acme Labs",
    accountEmail: "billing@acme.test",
    notifications: Object.fromEntries(
      notificationDefs.map((n) => [n.id, n.defaultOn]),
    ),
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
  const [hydrated, setHydrated] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [, forceTick] = React.useReducer((n: number) => n + 1, 0);
  const [now, setNow] = React.useState(() => Date.now());
  const accountNameRef = React.useRef<HTMLInputElement | null>(null);
  const accountEmailRef = React.useRef<HTMLInputElement | null>(null);

  // Hydrate once on mount.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<StoredSettings>;
        const merged = defaultState();
        if (typeof parsed.accountName === "string") {
          merged.accountName = parsed.accountName;
        }
        if (typeof parsed.accountEmail === "string") {
          merged.accountEmail = parsed.accountEmail;
        }
        if (
          parsed.notifications &&
          typeof parsed.notifications === "object"
        ) {
          for (const def of notificationDefs) {
            const v = (parsed.notifications as Record<string, unknown>)[
              def.id
            ];
            if (typeof v === "boolean") {
              merged.notifications[def.id] = v;
            }
          }
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState(merged);
        if (typeof parsed.savedAt === "string") {
          setSavedAt(parsed.savedAt);
        }
      }
    } catch {
      /* localStorage unavailable — keep defaults */
    }
    setHydrated(true);
  }, []);

  // Re-render the relative timestamp every 30s.
  React.useEffect(() => {
    if (!savedAt) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
      forceTick();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [savedAt]);

  // Persist on every change after hydration.
  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, savedAt }),
      );
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [state, savedAt, hydrated]);

  const handleToggle = (id: string, checked: boolean) => {
    setState((s) => ({
      ...s,
      notifications: { ...s.notifications, [id]: checked },
    }));
  };

  const handleSaveAccount = () => {
    const name = accountNameRef.current?.value ?? state.accountName;
    const email = accountEmailRef.current?.value ?? state.accountEmail;
    setState((s) => ({ ...s, accountName: name, accountEmail: email }));
    setSavedAt(new Date().toISOString());
    setNow(Date.now());
  };

  const handleSavePrefs = () => {
    setSavedAt(new Date().toISOString());
    setNow(Date.now());
  };

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
              defaultValue={state.accountName}
              key={`name-${hydrated}-${state.accountName}`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{dict.accountEmail}</Label>
            <Input
              id="email"
              type="email"
              ref={accountEmailRef}
              defaultValue={state.accountEmail}
              key={`email-${hydrated}-${state.accountEmail}`}
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
