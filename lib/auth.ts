import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { getDatabase } from "./relay/store";
import { systemCurrency, workspaceCurrency, quotaToCurrency, type Currency } from "./relay/currency";
import type { RelaySettings } from "./relay/config";

export const SESSION_COOKIE = "capi_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const PASSWORD_OPTIONS = { algorithm: "argon2id", memoryCost: 65536, timeCost: 3 } as const;

export type UserRole = "user" | "admin";
export type Permission = "dashboard:access" | "keys:manage" | "admin:access";
export type User = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
  balance: number;
  currency: Currency;
  createdAt: number;
};
type UserRow = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  created_at: number;
};
type Credentials = { email: string; password: string; name?: string };

export class AuthError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function publicUser(row: UserRow): Promise<User> {
  const db = await getDatabase();
  const permissions = db.query<{ permission: Permission }, [UserRole]>(
    "SELECT permission FROM role_permissions WHERE role = ? ORDER BY permission",
  ).all(row.role).map(({ permission }) => permission);
  const wallet = db.query<{ workspace_id: number; balance_units: number }, [number]>(
    `SELECT x.workspace_id, x.balance_units FROM workspaces w JOIN wallets x ON x.workspace_id = w.id
     WHERE w.kind = 'personal' AND w.personal_owner_user_id = ?`,
  ).get(row.id);
  const settingsRow = db.query<{ config: string }, []>("SELECT config FROM settings WHERE id = 1").get();
  const system = systemCurrency((settingsRow ? JSON.parse(settingsRow.config) : {}) as RelaySettings);
  const currency = wallet ? workspaceCurrency(db, wallet.workspace_id, system) : system;
  return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at, balance: wallet ? quotaToCurrency(wallet.balance_units, currency) : 0, currency, permissions };
}

export function sessionToken(request: Request): string | null {
  const entry = request.headers.get("cookie")?.split(";").find((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
  const token = entry?.trim().slice(SESSION_COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export async function getSessionUser(token: string | null | undefined): Promise<User | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const db = await getDatabase();
  const row = db.query<UserRow, [string, number]>(
    `SELECT u.id, u.email, u.name, u.role, u.created_at FROM users u
     JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).get(tokenHash(token), Date.now());
  return row ? publicUser(row) : null;
}

export async function getCurrentUser(request?: Request): Promise<User | null> {
  const token = request ? sessionToken(request) : (await cookies()).get(SESSION_COOKIE)?.value;
  return getSessionUser(token);
}

export async function requireUser(request: Request, permission?: Permission): Promise<User> {
  const user = await getCurrentUser(request);
  if (!user) throw new AuthError("Sign in to continue.", 401, "authentication_required");
  if (permission && !user.permissions.includes(permission)) {
    throw new AuthError("You do not have permission to perform this action.", 403, "permission_denied");
  }
  return user;
}

/** Cookie-authenticated mutations require a same-origin browser request. */
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const url = new URL(request.url);
  // Next receives the internal HTTP connection from OpenResty. The proxy owns
  // this header, so use its public protocol when validating browser origins.
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : url.protocol.slice(0, -1);
  const host = forwardedHost || url.host;
  const expectedOrigin = `${protocol}://${host}`;
  if (fetchSite === "cross-site" || (origin !== null && origin !== expectedOrigin)) {
    throw new AuthError("Cross-origin requests are not allowed.", 403, "invalid_origin");
  }
}

export async function readAuthBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.split(";")[0].trim().toLowerCase().endsWith("/json")) {
    throw new AuthError("Content-Type must be application/json.", 415, "invalid_content_type");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("A JSON body is required.", 400, "invalid_body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) {
        await reader.cancel();
        throw new AuthError("Request body is too large.", 413, "body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid object");
    return body as Record<string, unknown>;
  } catch {
    throw new AuthError("Body must be a JSON object.", 400, "invalid_body");
  }
}

function passwordOf(value: unknown, minimumLength = 8): string {
  const candidate = typeof value === "string" ? value : "";
  if (candidate.length < minimumLength || Buffer.byteLength(candidate, "utf8") > 1024) {
    throw new AuthError(`Use a password of at least ${minimumLength} characters and at most 1024 bytes.`, 400, "invalid_password");
  }
  return candidate;
}

function credentials(body: Record<string, unknown>, registering: boolean): Credentials {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError("Enter a valid email address.", 400, "invalid_email");
  }
  // The pre-launch platform administrator account is intentionally seeded with
  // the documented six-character bootstrap password. New and changed passwords
  // retain the normal eight-character minimum.
  const password = passwordOf(body.password, !registering && email === "admin@capi.run" ? 6 : 8);
  if (!registering) return { email, password };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) throw new AuthError("Name must contain 1 to 100 characters.", 400, "invalid_name");
  return { email, password, name };
}

function sessionCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function clearSessionCookie(): string {
  return sessionCookie("", 0);
}

async function createSession(userId: number, previousToken: string | null): Promise<string> {
  const db = await getDatabase();
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  db.transaction(() => {
    db.query("DELETE FROM sessions WHERE expires_at <= ?").run(now);
    if (previousToken) db.query("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(previousToken));
    db.query("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(tokenHash(token), userId, now, now + SESSION_SECONDS * 1000);
  }).immediate();
  return sessionCookie(token, SESSION_SECONDS);
}

export async function revokeSession(request: Request): Promise<void> {
  const token = sessionToken(request);
  if (!token) return;
  const db = await getDatabase();
  db.query("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
}

export async function register(request: Request): Promise<Response> {
  requireSameOrigin(request);
  const { name, email, password } = credentials(await readAuthBody(request), true);
  const passwordHash = await Bun.password.hash(password, PASSWORD_OPTIONS);
  const db = await getDatabase();
  const row = db.transaction(() => {
    const created = db.query<UserRow, [string, string, string, number]>(
      `INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING RETURNING id, email, name, role, created_at`,
    ).get(email, name!, passwordHash, Date.now());
    if (!created) return null;
    const now = Date.now();
    const workspace = db.query<{ id: number }, [string, number, number, number]>(
      `INSERT INTO workspaces (kind, name, created_by, personal_owner_user_id, created_at)
       VALUES ('personal', ?, ?, ?, ?) RETURNING id`,
    ).get(`${created.name}'s workspace`, created.id, created.id, now)!;
    db.query("INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(workspace.id, created.id, now);
    db.query("INSERT INTO wallets (workspace_id, balance_units) VALUES (?, 0)").run(workspace.id);
    return created;
  }).immediate();
  if (!row) throw new AuthError("An account with this email already exists.", 409, "email_in_use");
  const cookie = await createSession(row.id, sessionToken(request));
  return Response.json({ user: await publicUser(row) }, { status: 201, headers: { "set-cookie": cookie, "cache-control": "no-store" } });
}

export async function login(request: Request): Promise<Response> {
  requireSameOrigin(request);
  const { email, password } = credentials(await readAuthBody(request), false);
  const db = await getDatabase();
  const row = db.query<UserRow & { password_hash: string }, [string]>(
    "SELECT id, email, name, role, created_at, password_hash FROM users WHERE email = ?",
  ).get(email);
  // Unknown accounts still perform the expensive KDF, avoiding an instant lookup oracle.
  const valid = row ? await Bun.password.verify(password, row.password_hash) : (await Bun.password.hash(password, PASSWORD_OPTIONS), false);
  if (!row || !valid) throw new AuthError("Email or password is incorrect.", 401, "invalid_credentials");
  const cookie = await createSession(row.id, sessionToken(request));
  return Response.json({ user: await publicUser(row) }, { headers: { "set-cookie": cookie, "cache-control": "no-store" } });
}

/**
 * Replace the signed-in user's password after verifying the current one.
 *
 * Every other session for that user is dropped so a leaked password stops
 * working; the session performing the change stays valid.
 */
export async function changePassword(request: Request): Promise<Response> {
  requireSameOrigin(request);
  const user = await requireUser(request);
  const body = await readAuthBody(request);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const nextPassword = passwordOf(body.newPassword);
  const db = await getDatabase();
  const row = db.query<{ password_hash: string }, [number]>(
    "SELECT password_hash FROM users WHERE id = ?",
  ).get(user.id);
  if (!row) throw new AuthError("Sign in to continue.", 401, "authentication_required");
  if (!(await Bun.password.verify(currentPassword, row.password_hash))) {
    throw new AuthError("Current password is incorrect.", 401, "invalid_current_password");
  }
  const passwordHash = await Bun.password.hash(nextPassword, PASSWORD_OPTIONS);
  const currentTokenHash = tokenHash(sessionToken(request) ?? "");
  db.transaction(() => {
    db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);
    db.query("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(user.id, currentTokenHash);
  }).immediate();
  return Response.json({ success: true }, { headers: { "cache-control": "no-store" } });
}

export async function authResponse(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    console.error("Authentication request failed", error);
    return Response.json({ error: { code: "internal_error", message: "Unable to complete the request. Please try again." } }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
