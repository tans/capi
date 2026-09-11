import type { Metadata } from "next";

import { BarChart, BreakdownBar } from "@/components/dashboard/charts";
import { UsageTable, type UsageRow } from "@/components/dashboard/usage-table";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).dashboard.usage;
  return { title: t.title, description: t.subtitle };
}

const daily = [12, 18, 9, 24, 31, 22, 15, 28, 34, 26, 19, 41, 37, 29];
const labels = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14",
];

type RowSeed = {
  model: string;
  modalityKey: UsageRow["modalityKey"];
  requests: number;
  tokens: number | null;
  costAmount: number;
  cost: string;
};

const rows: RowSeed[] = [
  {
    model: "kling-v3-turbo-text-to-video",
    modalityKey: "video",
    requests: 2118,
    tokens: null,
    costAmount: 148.2,
    cost: "$148.20",
  },
  {
    model: "gpt-image-2-text-to-image",
    modalityKey: "image",
    requests: 3080,
    tokens: null,
    costAmount: 92.4,
    cost: "$92.40",
  },
  {
    model: "gpt-5.6",
    modalityKey: "text",
    requests: 6441,
    tokens: 18_200_000,
    costAmount: 61.1,
    cost: "$61.10",
  },
  {
    model: "suno-v5.5",
    modalityKey: "music",
    requests: 215,
    tokens: null,
    costAmount: 38.7,
    cost: "$38.70",
  },
  {
    model: "elevenlabs-tts-v3",
    modalityKey: "audio",
    requests: 779,
    tokens: null,
    costAmount: 31.16,
    cost: "$31.16",
  },
  {
    model: "veo-3.1-text-to-video",
    modalityKey: "video",
    requests: 84,
    tokens: null,
    costAmount: 28.9,
    cost: "$28.90",
  },
  {
    model: "text-embedding-4-large",
    modalityKey: "embeddings",
    requests: 1204,
    tokens: 4_800_000,
    costAmount: 0.62,
    cost: "$0.62",
  },
];

export default async function UsagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale).dashboard.usage;

  const breakdown = rows.map<UsageRow>((r) => ({
    model: r.model,
    modalityKey: r.modalityKey,
    modalityLabel: t.modalities[r.modalityKey],
    requests: r.requests,
    tokens: r.tokens,
    cost: r.cost,
    costAmount: r.costAmount,
  }));

  const byModality = aggregateByModality(breakdown, t);
  const byKey = buildByKey(breakdown);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          {t.title}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-md border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              {t.dailySpend}
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              {t.total} $371.56
            </span>
          </div>
          <BarChart data={daily} labels={labels} className="mt-6" />
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              {t.byModality}
            </h2>
            <BreakdownBar rows={byModality} className="mt-5" />
          </div>
          <div className="rounded-md border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              {t.byKey}
            </h2>
            <BreakdownBar rows={byKey} className="mt-5" />
          </div>
        </div>
      </div>

      <UsageTable rows={breakdown} dict={t} locale={locale} />
    </div>
  );
}

function aggregateByModality(
  rows: UsageRow[],
  t: { modalities: Record<UsageRow["modalityKey"], string> },
) {
  const grouped = new Map<UsageRow["modalityKey"], number>();
  for (const r of rows) {
    grouped.set(r.modalityKey, (grouped.get(r.modalityKey) ?? 0) + r.costAmount);
  }
  return Array.from(grouped.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, amount]) => ({
      label: t.modalities[key],
      value: amount,
      display: `$${amount.toFixed(2)}`,
    }));
}

function buildByKey(rows: UsageRow[]) {
  const names = ["video-pipeline", "web-prod-images", "internal-tools"];
  const weights = [0.55, 0.23, 0.15];
  const totalCost = rows.reduce((acc, r) => acc + r.costAmount, 0);
  return names.map((label, i) => {
    const amount = Number((totalCost * weights[i]).toFixed(2));
    return { label, value: amount, display: `$${amount.toFixed(2)}` };
  });
}
