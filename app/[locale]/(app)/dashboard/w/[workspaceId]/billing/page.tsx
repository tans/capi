import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";
import { getDatabase } from "@/lib/relay/store";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export default async function WorkspaceBilling({ params }: { params: Promise<{ locale:string; workspaceId:string }> }) {
 const p=await params; const locale=(await resolveLocale(params)) as Locale; const user=await getCurrentUser(); if(!user) redirect(localeHref(locale,"/login")); const id=Number(p.workspaceId); if(!Number.isInteger(id)) redirect(localeHref(locale,"/dashboard")); const workspace=await requireWorkspacePermission(user.id,id,"read");
 const db=await getDatabase(); const rows=db.query<{currency:string;balance_units:number;reserved_units:number},[number]>("SELECT currency,balance_units,reserved_units FROM wallets WHERE workspace_id=?").get(id) ?? {currency:"USD",balance_units:0,reserved_units:0};
 return <div className="flex flex-col gap-6"><div><a className="link link-hover text-sm" href={localeHref(locale,`/dashboard/w/${id}`)}>← {workspace.name}</a><h1 className="mt-3 text-2xl font-semibold">Billing</h1></div><div className="grid gap-4 sm:grid-cols-3">{[["Available",rows.balance_units-rows.reserved_units],["Balance",rows.balance_units],["Reserved",rows.reserved_units]].map(([label,value])=><div className="stat rounded-box border border-border bg-card" key={label as string}><div className="stat-title">{label}</div><div className="stat-value text-2xl">${(Number(value)/500000).toFixed(2)}</div><div className="stat-desc">{rows.currency}</div></div>)}</div></div>;
}
