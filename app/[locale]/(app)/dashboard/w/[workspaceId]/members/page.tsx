import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/relay/store";
import { getDictionary, interpolate } from "@/lib/i18n";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { MemberManager } from "@/components/dashboard/member-manager";

export default async function MembersPage({ params }: { params: Promise<{ locale:string; workspaceId:string }> }) {
 const p=await params; const locale=(await resolveLocale(params)) as Locale; const user=await getCurrentUser(); if(!user) redirect(localeHref(locale,"/login")); const id=Number(p.workspaceId); if(!Number.isInteger(id)) redirect(localeHref(locale,"/dashboard")); const workspace=await requireWorkspacePermission(user.id,id,"read"); const db=await getDatabase();
 const members=(await db.query<{id:number;name:string;email:string;role:string;status:string},[number]>(`SELECT m.id,u.name,u.email,m.role,m.status FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND m.status='active' ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,m.id`).all(id));
 const t=getDictionary(locale).dashboard.workspace.members; return <div className="flex flex-col gap-6"><a className="link link-hover text-sm" href={localeHref(locale,`/dashboard/w/${id}`)}>← {workspace.name}</a><div className="flex items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.description}</p></div><span className="badge badge-outline">{interpolate(t.count,{count:members.length})}</span></div><MemberManager workspaceId={id} locale={locale} initial={members} canManage={workspace.role !== "member"} canTransfer={workspace.role === "owner"}/></div>;
}
