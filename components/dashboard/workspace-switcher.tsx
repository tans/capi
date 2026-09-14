"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronsUpDown, Plus } from "lucide-react";
import { localeHref, type Locale } from "@/lib/i18n/config";

type Workspace = { id:number; name:string; kind:string; role:string };
export function WorkspaceSwitcher({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<Workspace[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { fetch("/api/workspaces").then(r => r.ok ? r.json() : null).then(d => setItems(d?.data ?? [])).catch(() => {}); }, []);
  const current = items[0];
  if (!current) return <Link className="btn btn-ghost btn-sm" href={localeHref(locale, "/dashboard")}>Workspace</Link>;
  return <div className="dropdown dropdown-end relative"><button type="button" className="btn btn-ghost btn-sm gap-2" onClick={() => setOpen(!open)}>{current.name}<ChevronsUpDown className="size-3.5" /></button>{open && <ul className="menu dropdown-content absolute right-0 z-50 mt-2 w-56 rounded-box border border-border bg-card p-2 shadow-lg">{items.map(w => <li key={w.id}><Link href={localeHref(locale, `/dashboard/w/${w.id}`)} onClick={() => setOpen(false)}>{w.name}<span className="badge badge-ghost ml-auto text-[10px]">{w.role}</span></Link></li>)}<li><Link href={localeHref(locale, "/dashboard/workspaces/new")}><Plus className="size-4" />Create team</Link></li></ul>}</div>;
}
