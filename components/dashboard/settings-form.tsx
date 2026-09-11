"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const notifications = [
  {
    id: "budget",
    label: "Budget alerts",
    body: "Email me when a key reaches 80% of its monthly budget.",
    defaultOn: true,
  },
  {
    id: "failed",
    label: "Failed generations",
    body: "Notify me when a task fails so I can retry or reroute it.",
    defaultOn: true,
  },
  {
    id: "weekly",
    label: "Weekly digest",
    body: "A Monday summary of spend, volume, and top models.",
    defaultOn: false,
  },
  {
    id: "product",
    label: "Product updates",
    body: "New models, features, and provider changes.",
    defaultOn: false,
  },
];

export function SettingsForm() {
  const [state, setState] = React.useState<Record<string, boolean>>(
    Object.fromEntries(notifications.map((n) => [n.id, n.defaultOn])),
  );
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border border-border bg-card p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          Profile
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="org">Organisation</Label>
            <Input id="org" defaultValue="Acme Labs" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Billing email</Label>
            <Input id="email" type="email" defaultValue="billing@acme.test" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="account">Account ID</Label>
            <Input id="account" defaultValue="acct_4821" readOnly />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan">Plan</Label>
            <Input id="plan" defaultValue="Pay as you go" readOnly />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          Notifications
        </h2>
        <div className="mt-5 flex flex-col divide-y divide-border">
          {notifications.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0"
            >
              <div>
                <p className="text-[14px] font-medium text-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
              <Switch
                checked={state[item.id]}
                onCheckedChange={(checked) =>
                  setState((s) => ({ ...s, [item.id]: checked }))
                }
                aria-label={item.label}
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
            Save changes
          </Button>
          {saved ? (
            <span className="text-[12px] text-emerald-600">
              Saved (browser only)
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-destructive/30 bg-card p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          Danger zone
        </h2>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          Closing the account revokes every key immediately and deletes
          generated media according to the retention schedule. Unused credits
          are refunded unless the account was closed for a terms breach.
        </p>
        <Button variant="outline" className="mt-5 border-destructive/40 text-destructive">
          Close account
        </Button>
      </div>
    </div>
  );
}
