import type { Metadata } from "next";

import { SettingsForm } from "@/components/dashboard/settings-form";

export const metadata: Metadata = {
  title: "Settings",
  description: "Account, notifications, and account closure.",
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Account details and notification preferences.
        </p>
      </div>
      <SettingsForm />
    </div>
  );
}
