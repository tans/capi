"use client";

import * as React from "react";
import { Check, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type UsageDict = Dictionary["dashboard"]["usage"];

type ModalityKey =
  | "video"
  | "image"
  | "text"
  | "music"
  | "audio"
  | "embeddings";

export type UsageRow = {
  model: string;
  modalityKey: ModalityKey;
  modalityLabel: string;
  requests: number;
  tokens: number | null;
  /** Numeric spend, used by the parent page for breakdown charts. */
  costAmount: number;
  /** Pre-formatted spend display, e.g. "$148.20" — already USD. */
  cost: string;
};

const MODALITY_ORDER: ModalityKey[] = [
  "video",
  "image",
  "text",
  "music",
  "audio",
  "embeddings",
];

function formatCount(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(n);
}

function formatTokens(tokens: number | null): string {
  if (tokens === null) return "—";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function UsageTable({
  rows,
  dict,
  locale,
}: {
  rows: UsageRow[];
  dict: UsageDict;
  locale: Locale;
}) {
  const [modality, setModality] = React.useState<ModalityKey | "all">("all");
  const [exported, setExported] = React.useState(false);

  const filtered = React.useMemo(
    () =>
      modality === "all"
        ? rows
        : rows.filter((r) => r.modalityKey === modality),
    [rows, modality],
  );

  const totals = React.useMemo(() => {
    let requests = 0;
    for (const r of filtered) requests += r.requests;
    return {
      requests,
      rows: filtered.length,
    };
  }, [filtered]);

  const exportCsv = React.useCallback(() => {
    const header = [
      dict.table.model,
      dict.table.modality,
      dict.table.requests,
      dict.table.tokens,
      dict.table.spend,
    ];
    const lines = [header.map(csvEscape).join(",")];
    for (const r of filtered) {
      lines.push(
        [
          r.model,
          r.modalityLabel,
          String(r.requests),
          formatTokens(r.tokens),
          r.cost,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `capi-usage-${modality}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExported(true);
    window.setTimeout(() => setExported(false), 1800);
  }, [filtered, dict, modality]);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          {dict.topModels}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>{dict.filters.title}</span>
            <select
              value={modality}
              onChange={(e) =>
                setModality(e.target.value as ModalityKey | "all")
              }
              className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground outline-none focus-visible:border-brand"
              aria-label={dict.filters.modality}
            >
              <option value="all">{dict.filters.all}</option>
              {MODALITY_ORDER.map((m) => (
                <option key={m} value={m}>
                  {dict.modalities[m]}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" onClick={exportCsv}>
            {exported ? (
              <>
                <Check className="size-4 text-emerald-600" />
                {dict.export.csv}
              </>
            ) : (
              <>
                <Download className="size-4" />
                {dict.export.csv}
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{dict.table.model}</TableHead>
              <TableHead>{dict.table.modality}</TableHead>
              <TableHead>{dict.table.requests}</TableHead>
              <TableHead>{dict.table.tokens}</TableHead>
              <TableHead>{dict.table.spend}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-[13px] text-muted-foreground"
                >
                  {dict.filters.noResults}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.model}>
                  <TableCell className="font-mono text-[12px] text-foreground">
                    {row.model}
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    {row.modalityLabel}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">
                    {formatCount(row.requests, locale)}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">
                    {formatTokens(row.tokens)}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] font-medium text-foreground">
                    {row.cost}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 font-mono text-[11px] text-muted-foreground">
        <span>
          {dict.exportHint} GET /api/v1/me/usage?modality={modality}&days=14
        </span>
        <span className="text-foreground">
          {totals.rows} · {formatCount(totals.requests, locale)}{" "}
          {dict.table.requests.toLowerCase()}
        </span>
      </div>
    </div>
  );
}
