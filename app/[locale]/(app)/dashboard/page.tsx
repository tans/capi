import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { listUserWorkspaces } from "@/lib/workspaces/service";


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).dashboard.overview;
  return { title: t.title, description: t.subtitle };
}



export default async function DashboardOverview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref(locale, "/login"));

  const spaces = await listUserWorkspaces(user.id);
  const workspace = spaces.find((space) => space.kind === "personal") ?? spaces[0];
  if (workspace) redirect(localeHref(locale, `/dashboard/w/${workspace.id}`));

  redirect(localeHref(locale, "/dashboard/workspaces/new"));
}
