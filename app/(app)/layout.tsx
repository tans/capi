import Link from "next/link";
import { Bell, ChevronDown } from "lucide-react";

import { DashNav } from "@/components/dashboard/dash-nav";
import { Logo } from "@/components/logo";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="container-page flex h-14 items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <Link href="/" aria-label="Capi home">
              <Logo />
            </Link>
            <span className="hidden font-mono text-[11px] tracking-wider text-muted-foreground uppercase sm:inline">
              Dashboard
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/docs"
              className="hidden text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Docs
            </Link>
            <button
              type="button"
              aria-label="Notifications"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Bell className="size-[17px]" />
            </button>
            <span className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-ink font-mono text-[10px] font-medium text-white">
                CA
              </span>
              <ChevronDown className="hidden size-3 text-muted-foreground sm:block" />
            </span>
          </div>
        </div>
      </header>

      <div className="container-page flex-1 py-8">
        <div className="grid gap-8 lg:grid-cols-[190px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <DashNav />
            </div>
          </aside>

          <main className="min-w-0">
            {/* Compact navigation for small screens. */}
            <div className="mb-6 overflow-x-auto lg:hidden">
              <DashNav className="flex-row gap-1" />
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
