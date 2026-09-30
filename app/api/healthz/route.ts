import { logEvent } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = {
    status: "ok",
    service: "capi",
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
  logEvent("info", "healthcheck_ok");
  return Response.json(payload, { headers: { "cache-control": "no-store" } });
}
