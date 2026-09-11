import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

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
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).dashboard.overview;
  return { title: t.title, description: t.subtitle };
}

const dailySpend = [
  12, 18, 9, 24, 31, 22, 15, 28, 34, 26, 19, 41, 37, 29,
];

const dayLabels = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14",
];

const byModel = [
  { label: "kling-v3-turbo-text-to-video", value: 148.2, display: "$148.20" },
  { label: "gpt-image-2-text-to-image", value: 92.4, display: "$92.40" },
  { label: "gpt-5.6", value: 61.1, display: "$61.10" },
  { label: "suno-v5.5", value: 38.7, display: "$38.70" },
  { label: "elevenlabs-tts-v3", value: 31.16, display: "$31.16" },
];

type RecentRow = {
  id: string;
  model: string;
  modality: string;
  variant: "text" | "image" | "video" | "audio" | "utility";
  status: "completed" | "processing" | "failed";
  cost: string;
  whenKey:
    | "twoMinutes"
    | "fourteenMinutes"
    | "eighteenMinutes"
    | "fortyOneMinutes"
    | "oneHour";
};

const recent: RecentRow[] = [
  {
    id: "tsk_8f21c4ba",
    model: "kling-v3-turbo-text-to-video",
    modality: "Video",
    variant: "video",
    status: "completed",
    cost: "$0.21",
    whenKey: "twoMinutes",
  },
  {
    id: "tsk_71ad09fe",
    model: "gpt-image-2-text-to-image",
    modality: "Image",
    variant: "image",
    status: "completed",
    cost: "$0.03",
    whenKey: "fourteenMinutes",
  },
  {
    id: "tsk_2c8b7e41",
    model: "suno-v5.5",
    modality: "Music",
    variant: "audio",
    status: "processing",
    cost: "—",
    whenKey: "eighteenMinutes",
  },
  {
    id: "tsk_5a01db72",
    model: "veo-3.1-text-to-video",
    modality: "Video",
    variant: "video",
    status: "failed",
    cost: "$0.00",
    whenKey: "fortyOneMinutes",
  },
  {
    id: "tsk_9e3f5507",
    model: "claude-opus-5",
    modality: "Text",
    variant: "text",
    status: "completed",
    cost: "$0.12",
    whenKey: "oneHour",
  },
];

const kpiDefs: Array<{
  key: keyof Dictionary["dashboard"]["overview"]["kpis"];
  noteKey: keyof Dictionary["dashboard"]["overview"]["kpiNotes"];
  value: string;
  trend: number[];
}> = [
  {
    key: "balance",
    noteKey: "balance",
    value: "$128.44",
    trend: [40, 42, 41, 55, 60, 58, 72, 70, 84, 96, 108, 120, 126, 128],
  },
  {
    key: "spend",
    noteKey: "spend",
    value: "$371.56",
    trend: [2, 5, 9, 12, 18, 24, 30, 38, 45, 55, 61, 70, 78, 86],
  },
  {
    key: "requests",
    noteKey: "requests",
    value: "18,942",
    trend: [30, 42, 38, 55, 61, 58, 72, 88, 96, 91, 110, 128, 141, 155],
  },
  {
    key: "successRate",
    noteKey: "successRate",
    value: "99.2%",
    trend: [99, 99, 98, 99, 99, 100, 99, 98, 99, 99, 99, 100, 99, 99],
  },
];

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
