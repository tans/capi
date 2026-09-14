import type { Metadata } from "next";

import { UsageLogTable } from "@/components/dashboard/usage-log-table";
import { getCurrentUser } from "@/lib/auth";
import { type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import { getRegistry } from "@/lib/relay/store";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return { title: locale === "zh" ? "使用记录" : "Usage records", description: locale === "zh" ? "每次 API 请求的模型、Token 与扣费明细。" : "Model, token, and charge details for every API request." };
}

export default async function UsageRecordsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await resolveLocale(params)) as Locale;
  const user = await getCurrentUser();
  const registry = await getRegistry();
  const keyIds = new Set(registry.listKeys().filter((key) => key.userId === user?.id).map((key) => key.id));
  const records = registry.listUsage({ days: 30 }).filter((record) => keyIds.has(record.keyId));

  return <div className="flex flex-col gap-6"><div><h1 className="text-[22px] font-semibold tracking-tight text-foreground">{locale === "zh" ? "使用记录" : "Usage records"}</h1><p className="mt-1 text-[13px] text-muted-foreground">{locale === "zh" ? "查看最近 30 天内每次 API 请求的模型、Token、扣费与状态。" : "Review the model, tokens, charge, and status for every API request from the last 30 days."}</p></div><UsageLogTable records={records} locale={locale} /></div>;
}
