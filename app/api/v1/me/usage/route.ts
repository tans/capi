import { isAuthorized, unauthorized } from "@/lib/mock-api";

type UsageRow = {
  model: string;
  modality: string;
  requests: number;
  tokens: number | null;
  cost: { amount: number; currency: "USD" };
};

const rows: UsageRow[] = [
  {
    model: "kling-v3-turbo-text-to-video",
    modality: "video",
    requests: 2118,
    tokens: null,
    cost: { amount: 148.2, currency: "USD" },
  },
  {
    model: "gpt-image-2-text-to-image",
    modality: "image",
    requests: 3080,
    tokens: null,
    cost: { amount: 92.4, currency: "USD" },
  },
  {
    model: "gpt-5.6",
    modality: "text",
    requests: 6441,
    tokens: 18_200_000,
    cost: { amount: 61.1, currency: "USD" },
  },
  {
    model: "suno-v5.5",
    modality: "music",
    requests: 215,
    tokens: null,
    cost: { amount: 38.7, currency: "USD" },
  },
  {
    model: "elevenlabs-tts-v3",
    modality: "audio",
    requests: 779,
    tokens: null,
    cost: { amount: 31.16, currency: "USD" },
  },
  {
    model: "veo-3.1-text-to-video",
    modality: "video",
    requests: 84,
    tokens: null,
    cost: { amount: 28.9, currency: "USD" },
  },
  {
    model: "text-embedding-4-large",
    modality: "embeddings",
    requests: 1204,
    tokens: 4_800_000,
    cost: { amount: 0.62, currency: "USD" },
  },
];

/**
 * Read per-model usage for the calling account.
 *
 * Query string filters:
 *   - `modality` (optional): one of video | image | text | music | audio | embeddings
 *   - `days` (optional):    7 | 14 | 30. Defaults to 14. Currently a no-op for the
 *                           mock — included so the contract is stable when real
 *                           history is wired in.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const url = new URL(request.url);
  const modality = url.searchParams.get("modality")?.toLowerCase() ?? "";
  const daysRaw = url.searchParams.get("days");
  const days = ["7", "14", "30"].includes(daysRaw ?? "") ? Number(daysRaw) : 14;

  const filtered = modality && modality !== "all"
    ? rows.filter((r) => r.modality === modality)
    : rows;

  const total = filtered.reduce(
    (acc, r) => ({
      requests: acc.requests + r.requests,
      cost: acc.cost + r.cost.amount,
    }),
    { requests: 0, cost: 0 },
  );

  return Response.json({
    account: "acct_4821",
    period_days: days,
    modality: modality || null,
    totals: {
      requests: total.requests,
      cost: { amount: Number(total.cost.toFixed(2)), currency: "USD" },
    },
    rows: filtered,
  });
}
