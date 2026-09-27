import { getEmailSettings, saveEmailSettings, sendConfiguredEmail, type EmailSettings } from "@/lib/email-settings";
import { requireAdmin } from "@/lib/relay/admin";

function safeSettings(settings: EmailSettings) {
  return {
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    security: settings.smtpSecure ? "ssl" : settings.smtpStartTls ? "starttls" : "none",
    smtpUser: settings.smtpUser,
    fromName: settings.fromName,
    fromAddress: settings.fromAddress,
    passwordConfigured: Boolean(settings.smtpPassword),
    updatedAt: settings.updatedAt,
  };
}

function badRequest(message: string) {
  return Response.json({ error: { message } }, { status: 400, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return Response.json(safeSettings(await getEmailSettings()), { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest("Settings must be an object.");
  const values = body as Record<string, unknown>;
  const allowed = ["smtpHost", "smtpPort", "security", "smtpUser", "smtpPassword", "fromName", "fromAddress"];
  if (Object.keys(values).some((key) => !allowed.includes(key))) return badRequest("Unknown email setting.");

  const host = typeof values.smtpHost === "string" ? values.smtpHost.trim() : "";
  const user = typeof values.smtpUser === "string" ? values.smtpUser.trim() : "";
  const fromName = typeof values.fromName === "string" ? values.fromName.trim() : "";
  const fromAddress = typeof values.fromAddress === "string" ? values.fromAddress.trim() : "";
  const port = values.smtpPort;
  const security = values.security;
  const password = values.smtpPassword;
  if (!host || host.length > 253 || /[\s/@]/.test(host)) return badRequest("Enter a valid SMTP host.");
  if (!Number.isSafeInteger(port) || (port as number) < 1 || (port as number) > 65535) return badRequest("SMTP port must be between 1 and 65535.");
  if (security !== "ssl" && security !== "starttls" && security !== "none") return badRequest("Choose a supported connection security option.");
  if (user.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) return badRequest("Enter a valid SMTP account email.");
  if (!fromName || fromName.length > 100) return badRequest("Sender name must contain 1 to 100 characters.");
  if (fromAddress.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress)) return badRequest("Enter a valid sender email address.");
  if (password !== undefined && (typeof password !== "string" || password.length > 1024)) return badRequest("SMTP password is too long.");

  const current = await getEmailSettings();
  const saved = await saveEmailSettings({
    smtpHost: host,
    smtpPort: port as number,
    smtpSecure: security === "ssl",
    smtpStartTls: security === "starttls",
    smtpUser: user,
    smtpPassword: typeof password === "string" && password.length > 0 ? password : current.smtpPassword,
    fromName,
    fromAddress,
    updatedAt: null,
  });
  return Response.json(safeSettings(saved), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON.");
  }
  const to = body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).to === "string"
    ? ((body as Record<string, string>).to).trim()
    : "";
  if (to.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return badRequest("Enter a valid test recipient email.");

  const settings = await getEmailSettings();
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
    return Response.json({ error: { message: "Save a complete SMTP account and password before sending a test." } }, { status: 409 });
  }
  try {
    await sendConfiguredEmail({
      to,
      subject: "CAPI mail configuration test",
      text: "Your CAPI email settings are working. This is a test message from the administrator settings page.",
    }, settings);
    return Response.json({ success: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("SMTP test email failed", error);
    return Response.json({ error: { message: "The test email could not be sent. Check the SMTP settings and try again." } }, { status: 502 });
  }
}
