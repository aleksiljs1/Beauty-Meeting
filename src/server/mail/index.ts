import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/server/env";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
});

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendMail(message: MailMessage): Promise<void> {
  await transport.sendMail({ from: env.MAIL_FROM, ...message });
}
