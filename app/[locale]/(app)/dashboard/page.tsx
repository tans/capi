import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

import {
  BarChart,
  BreakdownBar,
  Sparkline,
} from "@/components/dashboard/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth";
import { getRegistry, quotaToUsd } from "@/lib/relay";

type RecentRow = { id: string; model: string; modality: string; variant: "text" | "image" | "video" | "audio" | "utility"; status: "completed" | "processing" | "failed"; cost: string; whenKey: "twoMinutes" | "fourteenMinutes" | "eighteenMinutes" | "fortyOneMinutes" | "oneHour" };


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).dashboard.overview;
  return { title: t.title, description: t.subtitle };
}


const statusClasses: Record<string, string> = {
  completed: "border-transparent bg-emerald-50 text-emerald-700",
  processing: "border-transparent bg-amber-50 text-amber-700",
  failed: "border-transparent bg-red-50 text-red-700",
};

export default async function DashboardOverview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale).dashboard.overview;
  const common = getDictionary(locale).common;
  const user = await getCurrentUser();
  const registry = await getRegistry();
  const userKeys = user ? registry.listKeys().filter((key) => key.userId === user.id) : [];
  const keyIds = new Set(userKeys.map((key) => key.id));
  const usage = registry.listUsage({ days: 30 }).filter((row) => keyIds.has(row.keyId));
  const dailySpend = Array.from({ length: 14 }, (_, index) => { const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - (13 - index)); return usage.filter((row) => { const d = new Date(row.createdAt); return d >= day && d < new Date(day.getTime() + 86400000); }).reduce((sum, row) => sum + quotaToUsd(row.quota), 0); });
  const dayLabels = dailySpend.map((_, index) => String(index + 1));
  const modelTotals = new Map<string, number>(); for (const row of usage) modelTotals.set(row.model, (modelTotals.get(row.model) ?? 0) + quotaToUsd(row.quota));
  const byModel = [...modelTotals].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value, display: `$${value.toFixed(2)}` }));
  const recent: RecentRow[] = usage.slice(0, 5).map((row) => ({ id: row.id, model: row.model, modality: row.group, variant: "utility", status: "completed", cost: `$${quotaToUsd(row.quota).toFixed(2)}`, whenKey: "twoMinutes" }));
  const totalSpend = usage.reduce((sum, row) => sum + quotaToUsd(row.quota), 0);
  const kpiDefs = [{ key: "balance", noteKey: "balance", value: `$${quotaToUsd(userKeys.reduce((sum, key) => sum + key.remainQuota, 0)).toFixed(2)}`, trend: dailySpend }, { key: "spend", noteKey: "spend", value: `$${totalSpend.toFixed(2)}`, trend: dailySpend }, { key: "requests", noteKey: "requests", value: usage.length.toLocaleString(), trend: dailySpend }, { key: "successRate", noteKey: "successRate", value: usage.length ? "100%" : "0%", trend: dailySpend }] as Array<{ key: keyof typeof t.kpis; noteKey: keyof typeof t.kpiNotes; value: string; trend: number[] }>;
  const href = (path: string) => localeHref(locale, path);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            {t.title}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <Link href={href("/dashboard/keys")}>{t.manageKeys}</Link>
          </Button>
          <Button asChild variant="brand">
            <Link href={href("/docs/guides/quickstart")}>
              {t.getStarted}
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiDefs.map((kpi) => (
          <div
            key={kpi.key}
            className="rounded-md border border-border bg-card p-5"
          >
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {t.kpis[kpi.key]}
            </p>
            <p className="mt-3 text-[24px] font-semibold tracking-tight text-foreground">
              {kpi.value}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {t.kpiNotes[kpi.noteKey]}
            </p>
            <Sparkline data={kpi.trend} className="mt-4" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-md border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              {t.dailySpend}
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              USD
            </span>
          </div>
          <BarChart data={dailySpend} labels={dayLabels} className="mt-6" />
        </div>

        <div className="rounded-md border border-border bg-card p-6">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {t.costByModel}
          </h2>
          <BreakdownBar rows={byModel} className="mt-6" />
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {t.recentActivity}
          </h2>
          <Link
            href={href("/dashboard/usage")}
            className="text-[13px] text-brand underline-offset-4 hover:underline"
          >
            {common.viewAll}
          </Link>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t.table.task}</TableHead>
              <TableHead>{t.table.modality}</TableHead>
              <TableHead>{t.table.status}</TableHead>
              <TableHead>{t.table.cost}</TableHead>
              <TableHead>{t.table.when}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-[12px] text-foreground">
                  {row.id}
                  <span className="mt-0.5 block max-w-[240px] truncate font-sans text-[12px] text-muted-foreground">
                    {row.model}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={row.variant}>{row.modality}</Badge>
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-[3px] border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${statusClasses[row.status]}`}
                  >
                    {t.status[row.status]}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-[12px] text-muted-foreground">
                  {row.cost}
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground">
                  {t.when[row.whenKey]}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
