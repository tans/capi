import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";
import { getRegistry } from "@/lib/relay";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export default async function WorkspaceKeys({ params }: { params: Promise<{ locale:string; workspaceId:string }> }) {
 const p=await params; const locale=(await resolveLocale(params)) as Locale; const user=await getCurrentUser(); if(!user) redirect(localeHref(locale,"/login")); const id=Number(p.workspaceId); if(!Number.isInteger(id)) redirect(localeHref(locale,"/dashboard")); const workspace=await requireWorkspacePermission(user.id,id,"read");
 const rows=(await getRegistry()).listKeys().filter((key) => key.workspaceId === id && key.userId === user.id);
 return <div className="flex flex-col gap-6"><div><a className="link link-hover text-sm" href={localeHref(locale,`/dashboard/w/${id}`)}>← {workspace.name}</a><h1 className="mt-3 text-2xl font-semibold">API keys</h1></div><div className="overflow-x-auto rounded-box border border-border bg-card"><table className="table"><thead><tr><th>Prefix</th><th>Project</th><th>Status</th></tr></thead><tbody>{rows.map((key) => <tr key={key.id}><td className="font-mono">{key.name || `Key ${key.id}`}</td><td>{key.projectId ?? "Default"}</td><td><span className="badge badge-success badge-outline">Active</span></td></tr>)}{rows.length===0&&<tr><td colSpan={3} className="py-10 text-center text-sm text-muted-foreground">No workspace keys yet.</td></tr>}</tbody></table></div></div>;
}
