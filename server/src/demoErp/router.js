import express, { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from '../db.js';
import { buildSchool } from '../seedData.js';
import { seal, unseal, sha256, sameHash, signBody, getConnection } from '../services/erp.js';
import { todayIST } from '../services/dates.js';
import { signToken } from '../middleware/auth.js';
import { publicUser } from '../routes/auth.js';

/*
  Demo School ERP — a tiny stand-in for a real school ERP (Teachmint, Entab, Fedena…),
  so the connection can be shown end to end without a partner's API access.
    /demo-erp            the ERP's screen (apply leave, see ProxyPilot's updates arrive)
    /demo-erp/api/…      the ERP's API: ProxyPilot reads teachers, students and the timetable here,
                         and posts its signed webhooks to /demo-erp/api/webhook
  It only works while ProxyPilot is connected to it in demo mode.
*/

const here = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

export async function setupDemoErp({ proxypilotUrl, apiKey, webhookSecret, erpKey }) {
  await q(
    `INSERT INTO demo_erp_config (id, proxypilot_url, api_key_enc, webhook_secret_enc, erp_key_hash, updated_at)
     VALUES (1, $1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET proxypilot_url = $1, api_key_enc = $2, webhook_secret_enc = $3, erp_key_hash = $4, updated_at = NOW()`,
    [proxypilotUrl, seal(apiKey), seal(webhookSecret), sha256(erpKey)]
  );
  await q('DELETE FROM demo_erp_inbox');
  await q('DELETE FROM demo_erp_leaves');
}

export async function clearDemoErp() {
  await q('DELETE FROM demo_erp_config');
}

const config = async () => (await q('SELECT * FROM demo_erp_config WHERE id = 1'))[0] || null;

/** the demo ERP answers only while ProxyPilot is connected to it in demo mode */
async function active() {
  const [cfg, conn] = await Promise.all([config(), getConnection()]);
  return cfg && conn?.is_demo ? cfg : null;
}

router.get('/', (req, res) => res.sendFile(path.join(here, 'page.html')));

// Demo shortcut: open ProxyPilot as the teacher who was asked to cover, so the
// presenter can show her saying yes. Only for the built-in demo teachers (their
// shared password is already public on the login page) and only in demo mode.
router.get('/as/:erpId', async (req, res) => {
  const cfg = await active();
  const [u] = cfg
    ? await q(`SELECT * FROM users WHERE erp_id = $1 AND role = 'faculty' AND email LIKE '%@college.edu'`, [String(req.params.erpId).slice(0, 40)])
    : [];
  if (!u) return res.redirect('/demo-erp');
  const session = JSON.stringify({ token: signToken(u), user: publicUser(u) }).replace(/</g, '\\u003c');
  res.set('Cache-Control', 'no-store').type('html').send(`<!doctype html><meta charset="utf-8"><title>Opening ProxyPilot…</title>
<body style="background:#07100c;color:#edf2ec;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0">Opening ProxyPilot as ${u.name.replace(/[<>&"]/g, '')}…
<script>
  const s = ${session};
  try { localStorage.setItem('pp_token', s.token); localStorage.setItem('pp_user', JSON.stringify(s.user)); } catch (e) {}
  location.replace('/faculty');
</script></body>`);
});

const api = Router();
// (no JSON parser for the whole API: the webhook needs the raw body to check its signature)

// ---- the ERP's own API, read by ProxyPilot's "Sync now" ----
async function erpAuth(req, res, next) {
  const cfg = await active();
  if (!cfg) return res.status(404).json({ error: 'The demo ERP is not connected' });
  const key = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!sameHash(sha256(key), cfg.erp_key_hash)) return res.status(401).json({ error: 'Wrong ERP key' });
  next();
}

api.get('/teachers', erpAuth, (req, res) => {
  const { faculty } = buildSchool();
  res.json({ teachers: faculty.map((f) => ({ erpId: f.erpId, name: f.name, email: f.email, subjects: f.subjects })) });
});

api.get('/students', erpAuth, (req, res) => {
  res.json({ students: buildSchool().students });
});

api.get('/timetable', erpAuth, (req, res) => {
  const { slots } = buildSchool();
  res.json({
    entries: slots.map((s) => ({ day: s.day, period: s.period, className: s.className, subject: s.subject, topic: s.topic, teacherErpId: s.teacherErpId })),
  });
});

// ---- webhooks from ProxyPilot: check the signature, keep the message ----
api.post('/webhook', express.raw({ type: '*/*', limit: '200kb' }), async (req, res) => {
  const cfg = await active();
  if (!cfg) return res.status(404).json({ error: 'The demo ERP is not connected' });
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {});
  const ts = String(req.headers['x-proxypilot-timestamp'] || '');
  const sig = String(req.headers['x-proxypilot-signature'] || '').replace(/^sha256=/, '');
  const secret = unseal(cfg.webhook_secret_enc);
  const fresh = Math.abs(Date.now() / 1000 - Number(ts)) < 300;
  const verified = Boolean(secret && sig && fresh && sameHash(signBody(secret, ts, raw), sig));
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = { raw: raw.slice(0, 500) };
  }
  await q('INSERT INTO demo_erp_inbox (event, verified, body) VALUES ($1,$2,$3)', [String(req.headers['x-proxypilot-event'] || body?.event || '?'), verified, JSON.stringify(body)]);
  await q('DELETE FROM demo_erp_inbox WHERE id < (SELECT COALESCE(MAX(id), 0) - 300 FROM demo_erp_inbox)');
  if (!verified) return res.status(401).json({ error: 'Signature did not match' });
  // a leave this ERP sent was decided in ProxyPilot: show it on the ERP's leave list
  const ref = body?.data?.erpLeaveRef;
  if (ref && (body.event === 'leave.approved' || body.event === 'leave.declined')) {
    await q('UPDATE demo_erp_leaves SET proxypilot_status = $2 WHERE ref = $1', [ref, body.event === 'leave.approved' ? 'approved' : 'declined']);
  }
  res.json({ ok: true });
});

// ---- the ERP's screen ----
api.get('/state', async (req, res) => {
  const cfg = await active();
  const { faculty, students, slots } = buildSchool();
  const today = todayIST();
  const [inbox, leaves] = cfg
    ? await Promise.all([
        q('SELECT id, event, verified, body, received_at FROM demo_erp_inbox ORDER BY id DESC LIMIT 40'),
        q('SELECT ref, teacher_erp_id, date, end_date, session, reason, approved_in_erp, proxypilot_status, response, created_at FROM demo_erp_leaves ORDER BY id DESC LIMIT 20'),
      ])
    : [[], []];

  // today's substitutes: the latest update for every class ProxyPilot told us about
  const latest = new Map();
  for (const m of [...inbox].reverse()) {
    const d = m.body?.data;
    if (m.verified && m.event.startsWith('cover.') && d?.date === today) latest.set(d.coverId, { ...d, event: m.event });
    if (m.verified && m.event === 'leave.approved') {
      for (const c of m.body?.data?.classes || []) {
        if (c.date === today && !latest.has(c.coverId)) {
          latest.set(c.coverId, { coverId: c.coverId, period: c.period, className: c.className, subject: c.subject, absentTeacher: m.body.data.teacher, askedNow: c.askedFirst, status: 'pending', event: 'leave.approved' });
        }
      }
    }
  }
  res.json({
    connected: Boolean(cfg),
    proxypilotUrl: cfg?.proxypilot_url || null,
    today,
    school: { teachers: faculty.length, students: students.length, periods: slots.length, classes: new Set(slots.map((s) => s.className)).size },
    teachers: faculty.map((f) => ({ erpId: f.erpId, name: f.name, subjects: f.subjects })),
    inbox,
    leaves,
    todayCovers: [...latest.values()].sort((a, b) => a.period - b.period || String(a.className).localeCompare(b.className)),
  });
});

// a teacher applies for leave in the ERP -> the ERP sends it to ProxyPilot's API
api.post('/apply-leave', express.json({ limit: '20kb' }), async (req, res) => {
  const cfg = await active();
  if (!cfg) return res.status(409).json({ error: 'Link the demo school from ProxyPilot first (HOD › School ERP › Try with a demo school).' });
  const b = req.body || {};
  const [{ n }] = await q('SELECT COUNT(*)::int AS n FROM demo_erp_leaves');
  const ref = `LV-${1001 + n}-${Date.now().toString(36).slice(-3).toUpperCase()}`;
  const payload = {
    erpRef: ref,
    teacherErpId: String(b.teacherErpId || ''),
    date: String(b.date || ''),
    endDate: String(b.endDate || b.date || ''),
    session: ['full', 'morning', 'afternoon'].includes(b.session) ? b.session : 'full',
    reason: String(b.reason || 'Leave').slice(0, 120),
    approved: Boolean(b.approvedInErp),
  };
  let status = 0;
  let response = null;
  try {
    const r = await fetch(`${cfg.proxypilot_url}/api/v1/leaves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${unseal(cfg.api_key_enc)}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    status = r.status;
    response = await r.json().catch(() => ({}));
  } catch (e) {
    response = { error: e.message };
  }
  const ok = status >= 200 && status < 300;
  const ppStatus = ok ? response.status || response.result || 'sent' : 'rejected';
  if (ok) {
    await q(
      `INSERT INTO demo_erp_leaves (ref, teacher_erp_id, date, end_date, session, reason, approved_in_erp, proxypilot_status, response)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ref, payload.teacherErpId, payload.date, payload.endDate, payload.session, payload.reason, payload.approved, ppStatus, JSON.stringify(response)]
    );
  }
  res.status(ok ? 201 : status || 502).json({ ok, ref, sent: payload, proxypilot: response });
});

router.use('/api', api);

export default router;
