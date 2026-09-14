import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listUserWorkspaces } from "@/lib/workspaces/service";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export default async function WorkspaceOverview({ params }: { params: Promise<{ locale:string; workspaceId:string }> }) {
  const { workspaceId } = await params; const locale = (await resolveLocale(params)) as Locale; const user = await getCurrentUser(); if (!user) redirect(localeHref(locale,"/login"));
  const id = Number(workspaceId); if (!Number.isInteger(id)) redirect(localeHref(locale,"/dashboard"));
  const workspace = await requireWorkspacePermission(user.id, id, "read");
  const spaces = await listUserWorkspaces(user.id);
  return <div className="flex flex-col gap-8"><div><p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Workspace</p><h1 className="mt-2 text-[26px] font-semibold">{workspace.name}</h1><p className="mt-1 text-sm text-muted-foreground">{workspace.kind === "personal" ? "Personal workspace" : "Team workspace"} · {workspace.role}</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Members","/members"],["API keys","/keys"],["Billing","/billing"],["Channels","/channels"]].map(([label,path]) => <a key={path} className="card border border-border bg-card p-5 transition hover:border-brand" href={localeHref(locale, `/dashboard/w/${id}${path}`)}><div className="card-body p-0"><h2 className="card-title text-base">{label}</h2><p className="text-sm text-muted-foreground">Workspace management</p></div></a>)}</div><div className="rounded-md border border-border bg-card p-5"><h2 className="font-medium">Your workspaces</h2><ul className="mt-3 space-y-2">{spaces.map(s => <li key={s.id}><a className="link link-hover text-sm" href={localeHref(locale, `/dashboard/w/${s.id}`)}>{s.name} <span className="text-muted-foreground">({s.role})</span></a></li>)}</ul></div></div>;
}
