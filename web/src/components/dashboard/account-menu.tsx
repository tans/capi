"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, UserRound } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { localeHref, type Locale } from "@/lib/i18n/config";

/** Avatar dropdown in the dashboard bar: account management and sign-out. */
export function AccountMenu({
  locale,
  user,
  labels,
  destination,
}: {
  locale: Locale;
  user: { name: string; email: string };
  labels: { trigger: string; management: string; signOut: string; signOutError: string };
  destination: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("logout failed");
      router.replace(destination);
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={labels.trigger}
          className="flex items-center gap-1 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-ink font-mono text-[10px] font-medium text-white">
            {user.name.slice(0, 2).toUpperCase()}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-[13px] font-medium text-foreground">
              {user.name}
            </span>
            <span className="truncate text-[11px] font-normal text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={localeHref(locale, "/dashboard/account")}>
              <UserRound className="size-4" aria-hidden="true" />
              {labels.management}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void signOut()} disabled={busy}>
            <LogOut className="size-4" aria-hidden="true" />
            {busy ? "…" : labels.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <span role="alert" className="text-[11px] text-destructive">
          {labels.signOutError}
        </span>
      ) : null}
    </div>
  );
}
