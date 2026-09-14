import type { Metadata } from "next";
import { AdminTools } from "@/components/dashboard/admin-tools";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return { title: locale === "zh" ? "用户" : "Users" };
}

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(params);
  return <AdminTools locale={locale} section="users" />;
}
