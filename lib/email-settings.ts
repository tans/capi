import nodemailer from "nodemailer";

import { getDatabase } from "./relay/store";

export type EmailSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpStartTls: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromName: string;
  fromAddress: string;
  updatedAt: number | null;
};

type EmailSettingsRow = {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: number;
  smtp_starttls: number;
  smtp_user: string;
  smtp_password: string;
  from_name: string;
  from_address: string;
  updated_at: number;
};

export const defaultEmailSettings: EmailSettings = {
  smtpHost: "smtp.qq.com",
  smtpPort: 465,
  smtpSecure: true,
  smtpStartTls: false,
  smtpUser: "",
  smtpPassword: "",
  fromName: "CAPI",
  fromAddress: "",
  updatedAt: null,
};

export async function getEmailSettings(): Promise<EmailSettings> {
  const db = await getDatabase();
  const row = await db.query<EmailSettingsRow, []>("SELECT * FROM email_settings WHERE id = 1").get();
  if (!row) {
    // Keep existing deployments working until their saved settings are initialized in the admin UI.
    return {
      ...defaultEmailSettings,
      smtpUser: process.env.QQ_SMTP_USER ?? "",
      smtpPassword: process.env.QQ_SMTP_PASSWORD ?? "",
      fromAddress: process.env.QQ_SMTP_USER ?? "",
    };
  }
  return {
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecure: row.smtp_secure === 1,
    smtpStartTls: row.smtp_starttls === 1,
    smtpUser: row.smtp_user,
    smtpPassword: row.smtp_password,
    fromName: row.from_name,
    fromAddress: row.from_address,
    updatedAt: row.updated_at,
  };
}

export async function saveEmailSettings(settings: EmailSettings): Promise<EmailSettings> {
  const db = await getDatabase();
  const now = Date.now();
  await db.query(
    `INSERT INTO email_settings (id, smtp_host, smtp_port, smtp_secure, smtp_starttls, smtp_user, smtp_password, from_name, from_address, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET smtp_host = excluded.smtp_host, smtp_port = excluded.smtp_port,
       smtp_secure = excluded.smtp_secure, smtp_starttls = excluded.smtp_starttls, smtp_user = excluded.smtp_user,
       smtp_password = excluded.smtp_password, from_name = excluded.from_name,
       from_address = excluded.from_address, updated_at = excluded.updated_at`,
  ).run(
    settings.smtpHost,
    settings.smtpPort,
    settings.smtpSecure ? 1 : 0,
    settings.smtpStartTls ? 1 : 0,
    settings.smtpUser,
    settings.smtpPassword,
    settings.fromName,
    settings.fromAddress,
    now,
  );
  return { ...settings, updatedAt: now };
}

export async function sendConfiguredEmail(
  input: { to: string; subject: string; text: string },
  settings?: EmailSettings,
): Promise<void> {
  settings ??= await getEmailSettings();
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
    throw new Error("Password recovery SMTP is not configured");
  }
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    ...(settings.smtpStartTls ? { requireTLS: true } : {}),
    auth: { user: settings.smtpUser, pass: settings.smtpPassword },
  });
  await transporter.sendMail({
    from: { name: settings.fromName || "CAPI", address: settings.fromAddress || settings.smtpUser },
    ...input,
  });
}
