import { redirect } from "next/navigation";

import { WorkspaceFiles, type WorkspaceFile } from "@/components/dashboard/workspace-files";
import { getCurrentUser } from "@/lib/auth";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { getRegistry } from "@/lib/relay";
import { listMediaFiles } from "@/lib/relay/files";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export default async function WorkspaceFilesPage({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const { workspaceId } = await params;
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref(locale, "/login"));
  const id = Number(workspaceId);
  if (!Number.isInteger(id) || id <= 0) redirect(localeHref(locale, "/dashboard"));
  const workspace = await requireWorkspacePermission(user.id, id, "read");
  const registry = await getRegistry();
  const stored = await listMediaFiles(registry.database, id, 51, undefined, undefined, true);
  const files: WorkspaceFile[] = stored.slice(0, 50).map((file) => ({
    id: file.id,
    filename: file.filename,
    contentType: file.mimeType,
    bytes: file.byteSize,
    purpose: file.purpose,
    createdAt: file.createdAt,
    expiresAt: file.expiresAt,
  }));
  return <div className="flex flex-col gap-5">
    <a className="link link-hover w-fit text-sm" href={localeHref(locale, `/dashboard/w/${id}`)}>← {workspace.name}</a>
    <WorkspaceFiles workspaceId={id} locale={locale} files={files} hasMore={stored.length > 50} canManage={workspace.role !== "member"} />
  </div>;
}
