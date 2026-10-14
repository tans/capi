"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, Plus } from "lucide-react";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";

type Workspace = { id: string; name: string; kind: string; role: string };

export function WorkspaceSwitcher({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<Workspace[]>([]);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/workspaces");
        if (!response.ok) throw new Error("workspace list request failed");
        const data = await response.json();
        if (active) { setItems(data?.data ?? []); setLoadError(false); }
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    load(); window.addEventListener("capi:refresh", load);
    return () => { active = false; window.removeEventListener("capi:refresh", load); };
  }, []);

  const activeId = pathname.match(/\/dashboard\/w\/([^/]+)/)?.[1];
  const current = items.find((item) => String(item.id) === activeId) ?? (activeId ? undefined : items[0]);

  if (!current) {
    if (loadError) return <div className="flex items-center gap-2 text-xs" role="alert"><span>{getDictionary(locale).dashboard.components.nav.workspaceLoadError}</span><button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 border-transparent bg-transparent h-7 px-2 text-xs" type="button" onClick={() => window.dispatchEvent(new Event("capi:refresh"))}>{getDictionary(locale).dashboard.components.nav.retry}</button></div>;
    if (loading) return <span className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 border-transparent bg-transparent h-8 px-3 whitespace-nowrap" aria-live="polite">{getDictionary(locale).dashboard.components.nav.loadingWorkspaces}</span>;
    return (
      <Link className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 border-transparent bg-transparent h-8 px-3 whitespace-nowrap" href={localeHref(locale, "/dashboard")}>
        {getDictionary(locale).dashboard.components.nav.workspace}
      </Link>
    );
  }

  return (
    <div ref={rootRef} className="relative right-0 left-auto min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="workspace-switcher-menu"
        className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-3 py-2 text-sm font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50 border-transparent bg-transparent h-8 max-w-40 whitespace-nowrap"
        onClick={() => setOpen(!open)}
      >
        <span className="min-w-0 truncate">{current.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <ul id="workspace-switcher-menu" className="flex flex-col gap-0.5 absolute top-full right-0 z-50 mt-2 w-64 rounded-lg border border-border bg-card p-2 shadow-lg">
          {items.map((workspace) => (
            <li key={workspace.id}>
              <Link
                className="flex items-center gap-3"
                href={localeHref(locale, `/dashboard/w/${workspace.id}`)}
                onClick={() => setOpen(false)}
              >
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                <span className="inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium border-border bg-transparent shrink-0 text-[10px]">{workspace.role}</span>
              </Link>
            </li>
          ))}
          <li className="mt-1 border-t border-border pt-1">
            <Link href={localeHref(locale, "/dashboard/workspaces/new")} onClick={() => setOpen(false)}>
              <Plus className="size-4" />
              {getDictionary(locale).dashboard.components.nav.newWorkspace}
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
