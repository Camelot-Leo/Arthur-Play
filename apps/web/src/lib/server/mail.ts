import nodemailer from "nodemailer";
import { env } from "./env";

/**
 * Invio email (solo ai facilitatori) via SMTP del provider UE configurato (es. Brevo).
 * In sviluppo, senza SMTP_HOST, il messaggio viene stampato in console.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!env.smtp.host) {
    if (env.isProd) throw new Error("SMTP non configurato");
    console.log(`\n[email di sviluppo] ${subject}\n${text}\n`);
    return;
  }
  const transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  await transport.sendMail({ from: env.smtp.from, to, subject, text });
}
