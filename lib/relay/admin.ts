import { createHash, timingSafeEqual } from "node:crypto";

import { AuthError, requireSameOrigin, requireUser } from "../auth";
import { ADMIN_TOKEN } from "./config";

/** Explicit machine token or a signed-in user with persisted administrator permission. */
export async function requireAdmin(request: Request): Promise<Response | null> {
  const authorization = request.headers.get("authorization");
  const provided = request.headers.get("x-admin-token") ??
    (authorization?.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : null);
  if (provided !== null) {
    if (ADMIN_TOKEN && timingSafeEqual(
      createHash("sha256").update(provided).digest(),
      createHash("sha256").update(ADMIN_TOKEN).digest(),
    )) return null;
    return Response.json({ error: { code: "invalid_admin_token", message: "Invalid admin token." } }, { status: 401 });
  }
  try {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) requireSameOrigin(request);
    await requireUser(request, "admin:access");
    return null;
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
}

/** 渠道/密钥对象的脱敏序列化（不把上游完整 key 泄出去）。 */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
