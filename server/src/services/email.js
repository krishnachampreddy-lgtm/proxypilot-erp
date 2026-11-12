import crypto from 'node:crypto';
import { q } from '../db.js';

// ---------------------------------------------------------------
// Sends 6-digit codes by email (Gmail SMTP by default).
// Needs SMTP_USER (your Gmail) + SMTP_PASS (a Gmail App Password) on the server.
// ---------------------------------------------------------------

// Brevo (HTTP API) works on hosts that block SMTP ports, like Render's free plan.
const useBrevo = () => Boolean(process.env.BREVO_API_KEY);
const fromEmail = () => process.env.EMAIL_FROM || process.env.SMTP_USER;

export function emailEnabled() {
  return Boolean((useBrevo() && fromEmail()) || (process.env.SMTP_USER && process.env.SMTP_PASS));
}

async function sendViaBrevo({ to, subject, text, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: 'ProxyPilot', email: fromEmail() }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

let transporter;
async function getTransporter() {
  if (!transporter) {
    const nodemailer = (await import('nodemailer')).default;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

const hash = (code) => crypto.createHash('sha256').update(code).digest('hex');
const CODE_MINUTES = 10;

const SUBJECT = { login: 'Your ProxyPilot sign-in code', reset: 'Reset your ProxyPilot password' };
const LINE = {
  login: 'Use this code to sign in to ProxyPilot:',
  reset: 'Use this code to reset your ProxyPilot password:',
};

/** Create a code, store its hash, and email it. Returns false if asked again too soon. */
export async function sendCode(email, purpose) {
  const recent = await q(
    `SELECT 1 FROM email_codes WHERE email = $1 AND purpose = $2 AND created_at > NOW() - INTERVAL '45 seconds'`,
    [email, purpose]
  );
  if (recent.length) return { ok: false, error: 'Please wait a few seconds before asking for another code.' };

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await q(
    `INSERT INTO email_codes (email, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + make_interval(mins => $4))`,
    [email, purpose, hash(code), CODE_MINUTES]
  );

  if (process.env.EMAIL_DEV_LOG === '1') console.log(`[DEV] ${purpose} code for ${email}: ${code}`);
  if (!emailEnabled()) {
    if (process.env.EMAIL_DEV_LOG === '1') return { ok: true };
    return { ok: false, error: 'Email sending is not set up on the server yet.' };
  }

  const mail = {
    to: email,
    subject: SUBJECT[purpose],
    text: `${LINE[purpose]}\n\n${code}\n\nIt expires in ${CODE_MINUTES} minutes. If you did not ask for this, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px">
      <h2 style="color:#13233a;margin:0 0 12px">ProxyPilot</h2>
      <p>${LINE[purpose]}</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">${code}</p>
      <p style="color:#64748b;font-size:13px">It expires in ${CODE_MINUTES} minutes. If you did not ask for this, ignore this email.</p>
    </div>`,
  };
  if (useBrevo()) await sendViaBrevo(mail);
  else await (await getTransporter()).sendMail({ ...mail, from: `"ProxyPilot" <${fromEmail()}>` });
  return { ok: true };
}

/** Send any email (used for proxy request alerts). Quietly does nothing if email is not set up. */
export async function sendEmail({ to, subject, text, html }) {
  if (!emailEnabled() || !to) return false;
  const mail = { to, subject, text, html };
  if (useBrevo()) await sendViaBrevo(mail);
  else await (await getTransporter()).sendMail({ ...mail, from: `"ProxyPilot" <${fromEmail()}>` });
  return true;
}

/** Check a code. Marks it used on success; counts failed attempts (max 5). */
export async function verifyCode(email, purpose, code) {
  const [row] = await q(
    `SELECT * FROM email_codes WHERE email = $1 AND purpose = $2 AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [email, purpose]
  );
  if (!row || row.attempts >= 5) return false;
  if (row.code_hash !== hash(code)) {
    await q('UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    return false;
  }
  await q('UPDATE email_codes SET used = TRUE WHERE id = $1', [row.id]);
  return true;
}
