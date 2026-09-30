import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import { logEvent, sendAlert } from "@/lib/observability";
import { getDatabase } from "@/lib/relay/store";
import { resolveStorageConfig } from "@/lib/storage/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const db = await getDatabase();
    await db.query<{ ok: number }, []>("SELECT 1 AS ok").get();

    const storage = resolveStorageConfig();
    if (storage.localPath) {
      const filesDir = path.resolve(process.cwd(), process.env.CAPI_FILES_DIR?.trim() || "data/files");
      await mkdir(filesDir, { recursive: true });
      await access(path.dirname(storage.localPath));
      await access(filesDir);
    }

    const durationMs = Date.now() - started;
    logEvent("info", "readiness_ok", { durationMs });
    return Response.json(
      { status: "ready", database: "ok", storage: "ok", duration_ms: durationMs, timestamp: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - started;
    logEvent("error", "readiness_failed", { durationMs, error: message });
    await sendAlert("readiness_failed", message, { durationMs });
    return Response.json(
      { status: "not_ready", database: "error", duration_ms: durationMs, timestamp: new Date().toISOString() },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
