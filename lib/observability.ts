type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "capi",
    ...fields,
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

type AlertState = typeof globalThis & { __capiLastAlerts?: Map<string, number> };

export async function sendAlert(event: string, message: string, fields: LogFields = {}) {
  const url = process.env.CAPI_ALERT_WEBHOOK_URL?.trim();
  if (!url) return;

  const cooldownMs = 5 * 60 * 1000;
  const state = globalThis as AlertState;
  state.__capiLastAlerts ??= new Map();
  const last = state.__capiLastAlerts.get(event) ?? 0;
  if (Date.now() - last < cooldownMs) return;
  state.__capiLastAlerts.set(event, Date.now());

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        service: "capi",
        event,
        message,
        timestamp: new Date().toISOString(),
        ...fields,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (error) {
    logEvent("error", "alert_delivery_failed", {
      alertEvent: event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
