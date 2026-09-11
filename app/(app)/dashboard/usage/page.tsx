import type { Metadata } from "next";

import { BarChart, BreakdownBar } from "@/components/dashboard/charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Usage",
  description: "Spend and request volume by model, key, and modality.",
};

const daily = [
  12, 18, 9, 24, 31, 22, 15, 28, 34, 26, 19, 41, 37, 29,
];
const labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"];

const byModality = [
  { label: "Video", value: 186.4, display: "$186.40" },
  { label: "Image", value: 92.4, display: "$92.40" },
  { label: "LLM", value: 61.1, display: "$61.10" },
  { label: "Music", value: 38.7, display: "$38.70" },
  { label: "Audio", value: 31.16, display: "$31.16" },
];

const byKey = [
  { label: "video-pipeline", value: 218.3, display: "$218.30" },
  { label: "web-prod-images", value: 92.4, display: "$92.40" },
  { label: "internal-tools", value: 61.1, display: "$61.10" },
];

const rows = [
  { model: "kling-v3-turbo-text-to-video", modality: "Video", requests: "2,118", tokens: "—", cost: "$148.20" },
  { model: "gpt-image-2-text-to-image", modality: "Image", requests: "3,080", tokens: "—", cost: "$92.40" },
  { model: "gpt-5.6", modality: "Text", requests: "6,441", tokens: "18.2M", cost: "$61.10" },
  { model: "suno-v5.5", modality: "Music", requests: "215", tokens: "—", cost: "$38.70" },
  { model: "elevenlabs-tts-v3", modality: "Audio", requests: "779", tokens: "—", cost: "$31.16" },
  { model: "veo-3.1-text-to-video", modality: "Video", requests: "84", tokens: "—", cost: "$28.90" },
  { model: "text-embedding-4-large", modality: "Embeddings", requests: "1,204", tokens: "4.8M", cost: "$0.62" },
];

export default function UsagePage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          Usage
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Last 14 days · all keys · USD
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-md border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              Daily spend
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              Total $371.56
            </span>
          </div>
          <BarChart data={daily} labels={labels} className="mt-6" />
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              By modality
            </h2>
            <BreakdownBar rows={byModality} className="mt-5" />
          </div>
          <div className="rounded-md border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              By key
            </h2>
            <BreakdownBar rows={byKey} className="mt-5" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            By model
          </h2>
          <span className="font-mono text-[11px] text-muted-foreground">
            Export via GET /api/v1/me/usage
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Model</TableHead>
                <TableHead>Modality</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.model}>
                  <TableCell className="font-mono text-[12px] text-foreground">
                    {row.model}
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    {row.modality}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">
                    {row.requests}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">
                    {row.tokens}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] font-medium text-foreground">
                    {row.cost}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
