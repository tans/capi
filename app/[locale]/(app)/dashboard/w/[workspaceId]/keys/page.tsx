import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export default async function WorkspaceKeys({ params }: { params: Promise<{ locale:string; workspaceId:string }> }) {
 const p=await params; const locale=(await resolveLocale(params)) as Locale; const user=await getCurrentUser(); if(!user) redirect(localeHref(locale,"/login")); const id=Number(p.workspaceId); if(!Number.isInteger(id)) redirect(localeHref(locale,"/dashboard")); const workspace=await requireWorkspacePermission(user.id,id,"read");
 const response=await fetch(new URL(`/api/workspaces/${id}/keys`, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"), { cache:"no-store" }).catch(()=>null); const payload=response?.ok ? await response.json() : null; const rows=payload?.data ?? payload ?? {};
 return <div className="flex flex-col gap-6"><div><a className="link link-hover text-sm" href={localeHref(locale,`/dashboard/w/${id}`)}>← {workspace.name}</a><h1 className="mt-3 text-2xl font-semibold">API keys</h1></div><div className="card border border-border bg-card"><div className="card-body"><pre className="overflow-auto text-xs text-muted-foreground">{JSON.stringify(rows,null,2)}</pre></div></div></div>;
}
