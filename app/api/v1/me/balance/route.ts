import { isAuthorized, unauthorized } from "@/lib/mock-api";

/** Current credit balance for the account owning the key. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  return Response.json({
    account: "acct_4821",
    balance: { amount: 128.44, currency: "USD" },
    reserved: { amount: 0.21, currency: "USD" },
    period: {
      starts_at: "2026-03-01T00:00:00Z",
      spend: { amount: 371.56, currency: "USD" },
      requests: 18942,
    },
  });
}
