import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.ts";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

let transport: Transporter | undefined;

// Mail is optional: without SMTP_URL nothing is sent and callers fall back to
// showing the link. Held on an object so tests can replace `send` and never
// reach a real SMTP server.
export const mailer = {
  configured(): boolean {
    return Boolean(env.SMTP_URL);
  },

  async send(mail: Mail): Promise<void> {
    if (!env.SMTP_URL) {
      throw new Error("SMTP is not configured");
    }
    transport ??= nodemailer.createTransport(env.SMTP_URL);
    await transport.sendMail({ from: env.MAIL_FROM, ...mail });
  },
};
