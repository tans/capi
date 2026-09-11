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

export const metadata: Metadata = {
  title: "Overview",
  description: "Balance, spend, and recent activity.",
};

const dailySpend = [
  12, 18, 9, 24, 31, 22, 15, 28, 34, 26, 19, 41, 37, 29,
];

const dayLabels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"];

const kpis = [
  {
    label: "Balance",
    value: "$128.44",
    delta: "+$20.00 added",
    trend: [40, 42, 41, 55, 60, 58, 72, 70, 84, 96, 108, 120, 126, 128],
  },
  {
    label: "Spend this month",
    value: "$371.56",
    delta: "14 days elapsed",
    trend: [2, 5, 9, 12, 18, 24, 30, 38, 45, 55, 61, 70, 78, 86],
  },
  {
    label: "Requests",
    value: "18,942",
    delta: "1,284 today",
    trend: [30, 42, 38, 55, 61, 58, 72, 88, 96, 91, 110, 128, 141, 155],
  },
  {
    label: "Success rate",
    value: "99.2%",
    delta: "0.4% below last week",
    trend: [99, 99, 98, 99, 99, 100, 99, 98, 99, 99, 99, 100, 99, 99],
  },
];

const byModel = [
  { label: "kling-v3-turbo-text-to-video", value: 148.2, display: "$148.20" },
  { label: "gpt-image-2-text-to-image", value: 92.4, display: "$92.40" },
  { label: "gpt-5.6", value: 61.1, display: "$61.10" },
  { label: "suno-v5.5", value: 38.7, display: "$38.70" },
  { label: "elevenlabs-tts-v3", value: 31.16, display: "$31.16" },
];

const recent = [
  {
    id: "tsk_8f21c4ba",
    model: "kling-v3-turbo-text-to-video",
    modality: "Video",
    variant: "video" as const,
    status: "completed",
    cost: "$0.21",
    when: "2 minutes ago",
  },
  {
    id: "tsk_71ad09fe",
    model: "gpt-image-2-text-to-image",
    modality: "Image",
    variant: "image" as const,
    status: "completed",
    cost: "$0.03",
    when: "14 minutes ago",
  },
  {
    id: "tsk_2c8b7e41",
    model: "suno-v5.5",
    modality: "Music",
    variant: "audio" as const,
    status: "processing",
    cost: "—",
    when: "18 minutes ago",
  },
  {
    id: "tsk_5a01db72",
    model: "veo-3.1-text-to-video",
    modality: "Video",
    variant: "video" as const,
    status: "failed",
    cost: "$0.00",
    when: "41 minutes ago",
  },
  {
    id: "tsk_9e3f5507",
    model: "claude-opus-5",
    modality: "Text",
    variant: "text" as const,
    status: "completed",
    cost: "$0.12",
    when: "1 hour ago",
  },
];

const statusStyles: Record<string, string> = {
  completed: "border-transparent bg-emerald-50 text-emerald-700",
  processing: "border-transparent bg-amber-50 text-amber-700",
  failed: "border-transparent bg-red-50 text-red-700",
};

export default function DashboardOverview() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Overview
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Account acct_4821 · usage for the last 14 days.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <Link href="/dashboard/keys">Manage keys</Link>
          </Button>
          <Button asChild variant="brand">
            <Link href="/docs/guides/quickstart">
              Get started
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-md border border-border bg-card p-5"
          >
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {kpi.label}
            </p>
            <p className="mt-3 text-[24px] font-semibold tracking-tight text-foreground">
              {kpi.value}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">{kpi.delta}</p>
            <Sparkline data={kpi.trend} className="mt-4" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-md border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              Daily spend
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              USD
            </span>
          </div>
          <BarChart data={dailySpend} labels={dayLabels} className="mt-6" />
        </div>

        <div className="rounded-md border border-border bg-card p-6">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            Cost by model
          </h2>
          <BreakdownBar rows={byModel} className="mt-6" />
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            Recent activity
          </h2>
          <Link
            href="/dashboard/usage"
            className="text-[13px] text-brand underline-offset-4 hover:underline"
          >
            View all
          </Link>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Task</TableHead>
              <TableHead>Modality</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>When</TableHead>
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
                    className={`rounded-[3px] border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${statusStyles[row.status]}`}
                  >
                    {row.status}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-[12px] text-muted-foreground">
                  {row.cost}
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground">
                  {row.when}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
