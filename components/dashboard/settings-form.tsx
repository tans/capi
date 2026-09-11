"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export function SettingsForm({ dict }: { dict: Dict }) {
  const [state, setState] = React.useState<Record<string, boolean>>(
    Object.fromEntries(notificationDefs.map((n) => [n.id, n.defaultOn])),
  );
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="flex flex-col gap-6">
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
            <Input id="org" defaultValue="Acme Labs" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{dict.accountEmail}</Label>
            <Input id="email" type="email" defaultValue="billing@acme.test" />
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
                checked={state[item.id]}
                onCheckedChange={(checked) =>
                  setState((s) => ({ ...s, [item.id]: checked }))
                }
                aria-label={dict[item.titleKey]}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-4">
          <Button
            variant="brand"
            onClick={() => {
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1800);
            }}
          >
            {dict.save}
          </Button>
          {saved ? (
            <span className="text-[12px] text-emerald-600">{dict.saved}</span>
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
