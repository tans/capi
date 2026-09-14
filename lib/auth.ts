import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { getDatabase } from "./relay/store";

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
  createdAt: number;
};
type UserRow = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  balance_quota: number;
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
  return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at, balance: row.balance_quota / 500_000, permissions };
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
    `SELECT u.id, u.email, u.name, u.role, u.balance_quota, u.created_at FROM users u
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
  if (fetchSite === "cross-site" || (origin !== null && origin !== new URL(request.url).origin)) {
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

function credentials(body: Record<string, unknown>, registering: boolean): Credentials {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError("Enter a valid email address.", 400, "invalid_email");
  }
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 1024) {
    throw new AuthError("Use a password of at least 8 characters and at most 1024 bytes.", 400, "invalid_password");
  }
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
       ON CONFLICT(email) DO NOTHING RETURNING id, email, name, role, balance_quota, created_at`,
    ).get(email, name!, passwordHash, Date.now());
    if (!created) return null;
    const now = Date.now();
    const workspace = db.query<{ id: number }, [string, number, number, number]>(
      `INSERT INTO workspaces (kind, name, created_by, personal_owner_user_id, created_at)
       VALUES ('personal', ?, ?, ?, ?) RETURNING id`,
    ).get(`${created.name}'s workspace`, created.id, created.id, now)!;
    db.query("INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(workspace.id, created.id, now);
    db.query("INSERT INTO wallets (workspace_id) VALUES (?)").run(workspace.id);
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
    "SELECT id, email, name, role, balance_quota, created_at, password_hash FROM users WHERE email = ?",
  ).get(email);
  // Unknown accounts still perform the expensive KDF, avoiding an instant lookup oracle.
  const valid = row ? await Bun.password.verify(password, row.password_hash) : (await Bun.password.hash(password, PASSWORD_OPTIONS), false);
  if (!row || !valid) throw new AuthError("Email or password is incorrect.", 401, "invalid_credentials");
  const cookie = await createSession(row.id, sessionToken(request));
  return Response.json({ user: await publicUser(row) }, { headers: { "set-cookie": cookie, "cache-control": "no-store" } });
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
