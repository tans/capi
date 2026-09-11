"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, ChevronDown, Menu } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { mainNav, modalityNav, toolNav } from "@/lib/site";
import { cn } from "@/lib/utils";

const languages = [
  "English",
  "简体中文",
  "繁體中文",
  "日本語",
  "한국어",
  "Español",
  "Deutsch",
  "Français",
  "Português",
  "Italiano",
];

function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "text-[13px] text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container-page">
        <div className="flex h-14 items-center justify-between gap-6">
          <div className="flex items-center gap-7">
            <Link href="/" aria-label="Capi home">
              <Logo />
            </Link>
            <nav className="hidden items-center gap-6 lg:flex">
              {modalityNav.map((item) => (
                <NavLink key={item.href} href={item.href}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <nav className="hidden items-center gap-6 md:flex">
              {mainNav.map((item) => (
                <NavLink key={item.href} href={item.href}>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="hidden items-center gap-3 md:flex">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground">
                  English
                  <ChevronDown className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {languages.map((lang, i) => (
                    <DropdownMenuItem key={lang} disabled={i === 0}>
                      {lang}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                aria-label="Notifications"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Bell className="size-[17px]" />
              </button>

              <Link
                href="/dashboard"
                aria-label="Account"
                className="flex size-7 items-center justify-center rounded-full bg-ink font-mono text-[10px] font-medium text-white"
              >
                CA
              </Link>
            </div>

            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open menu"
                  className="text-muted-foreground md:hidden"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[86%] max-w-sm p-0">
                <SheetHeader>
                  <SheetTitle className="sr-only">Menu</SheetTitle>
                  <Logo />
                </SheetHeader>
                <div className="flex flex-col gap-6 overflow-y-auto px-6 pb-8">
                  <div className="flex flex-col gap-3">
                    <p className="eyebrow">Models</p>
                    {modalityNav.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="text-sm text-foreground"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3">
                    <p className="eyebrow">Platform</p>
                    {[...mainNav, ...toolNav].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="text-sm text-foreground"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button asChild size="lg">
                      <Link href="/signup" onClick={() => setOpen(false)}>
                        Get API key
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg">
                      <Link href="/login" onClick={() => setOpen(false)}>
                        Sign in
                      </Link>
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="hidden h-11 items-center justify-center gap-6 border-t border-border/70 md:flex">
          {toolNav.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>
    </header>
  );
}
