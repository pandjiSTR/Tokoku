import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

export const mailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter: Transporter | null = null;

export async function sendMail(msg: { to: string; subject: string; text: string }) {
  if (!mailConfigured()) throw new Error('SMTP belum dikonfigurasi');
  const port = Number(process.env.SMTP_PORT ?? 587);
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000, socketTimeout: 10000,
  });
  await transporter.sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, to: msg.to, subject: msg.subject, text: msg.text });
}
