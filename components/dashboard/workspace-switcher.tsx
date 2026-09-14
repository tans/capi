"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, Plus } from "lucide-react";
import { localeHref, type Locale } from "@/lib/i18n/config";

type Workspace = { id:number; name:string; kind:string; role:string };
export function WorkspaceSwitcher({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<Workspace[]>([]);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { fetch("/api/workspaces").then(r => r.ok ? r.json() : null).then(d => setItems(d?.data ?? [])).catch(() => {}); }, []);
  const activeId = pathname.match(/\/dashboard\/w\/(\d+)/)?.[1];
  const current = items.find((item) => String(item.id) === activeId) ?? items[0];
  if (!current) return <Link className="btn btn-ghost btn-sm" href={localeHref(locale, "/dashboard")}>Workspace</Link>;
  return <div className="dropdown dropdown-end relative"><button type="button" className="btn btn-ghost btn-sm h-9 gap-2 px-2.5 font-normal" onClick={() => setOpen(!open)}><span className="max-w-36 truncate">{current.name}</span><ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" /></button>{open && <ul className="menu dropdown-content absolute right-0 z-50 mt-2 w-64 rounded-box border border-border bg-card p-2 shadow-lg">{items.map(w => <li key={w.id}><Link className="flex items-center gap-3" href={localeHref(locale, `/dashboard/w/${w.id}`)} onClick={() => setOpen(false)}><span className="min-w-0 flex-1 truncate">{w.name}</span><span className="badge badge-ghost shrink-0 text-[10px]">{w.role}</span></Link></li>)}<li className="mt-1 border-t border-border pt-1"><Link className="gap-3" href={localeHref(locale, "/dashboard/workspaces/new")}><Plus className="size-4" />Create team</Link></li></ul>}</div>;
}
