import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/server/env";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  // A real mail account must never fall back to plain text (setup and reset links travel here);
  // only the local test inbox, which has no login, runs without TLS.
  requireTLS: !env.SMTP_SECURE && !!env.SMTP_USER,
  // A mail server that stops answering must not hold up an import or the reminder job for minutes.
  connectionTimeout: 15_000,
  greetingTimeout: 15_000,
  socketTimeout: 30_000,
});

/** "al***@gmail.com": enough to tell recipients apart in the logs without writing addresses there. */
const maskAddress = (address: string) => address.replace(/^(.{0,2})[^@]*/, "$1***");

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendMail(message: MailMessage): Promise<void> {
  const result = await transport.sendMail({ from: env.MAIL_FROM, ...message });
  // Proof of hand-off for "I got no email" reports: the mail server accepted it, delivery is theirs.
  console.info(`[mail] "${message.subject}" → ${maskAddress(message.to)}: ${result.response}`);
}
