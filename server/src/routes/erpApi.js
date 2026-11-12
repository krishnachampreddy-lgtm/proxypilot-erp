import { Router } from 'express';
import { q } from '../db.js';
import { getConnection, sha256, sameHash, logEvent, applyTeachers, applyStudents, applyTimetable, intakeLeave, leaveStatus, coversOn, ERP_EVENTS } from '../services/erp.js';
import { decideLeave } from '../services/decide.js';
import { publish } from '../services/live.js';
import { todayIST, prettyDate } from '../services/dates.js';
import { withSweep } from '../services/escalate.js';

/*
  The school ERP's way in: /api/v1/…
  Every call carries the API key the HOD created:  Authorization: Bearer pp_live_…
  Full guide for the ERP's developers: docs/ERP-API.md
*/

const router = Router();

// a small limit per caller, so a broken ERP script can't flood the site
const hits = new Map();
router.use((req, res, next) => {
  const key = req.ip || 'x';
  const now = Date.now();
  const h = hits.get(key) || { n: 0, reset: now + 60_000 };
  if (now > h.reset) Object.assign(h, { n: 0, reset: now + 60_000 });
  h.n++;
  hits.set(key, h);
  if (hits.size > 5000) hits.clear();
  if (h.n > 240) return res.status(429).json({ error: 'Too many requests — at most 240 a minute' });
  next();
});

// API key check
router.use(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : String(req.headers['x-api-key'] || '').trim();
  if (!key) return res.status(401).json({ error: 'Send your ProxyPilot API key: Authorization: Bearer pp_live_…' });
  const c = await getConnection();
  if (!c?.api_key_hash || !sameHash(sha256(key), c.api_key_hash)) return res.status(401).json({ error: 'That API key is not valid (it may have been replaced)' });
  next();
});

router.use(withSweep);

const asyncRoute = (fn) => (req, res) =>
  fn(req, res).catch(async (e) => {
    const status = e.status || 500;
    await logEvent('in', `${req.method} ${req.path}`, 'failed', e.message).catch(() => {});
    if (status === 500) console.error('[erp api]', e);
    res.status(status).json({ error: status === 500 ? 'Something went wrong on the server' : e.message });
  });

router.get('/ping', asyncRoute(async (req, res) => {
  const c = await getConnection();
  res.json({ ok: true, school: c?.erp_name || null, today: todayIST(), events: ERP_EVENTS });
}));

const listOf = (body, key) => {
  const list = Array.isArray(body) ? body : body?.[key];
  if (!Array.isArray(list)) {
    const e = new Error(`Send { "${key}": [ … ] }`);
    e.status = 400;
    throw e;
  }
  if (list.length > 5000) {
    const e = new Error('At most 5000 items in one call');
    e.status = 413;
    throw e;
  }
  return list;
};

router.put('/teachers', asyncRoute(async (req, res) => {
  const list = listOf(req.body, 'teachers');
  const r = await applyTeachers(list);
  await logEvent('in', 'teachers', 'ok', `${list.length} teachers · ${r.created} new, ${r.updated} updated${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}`);
  publish(['hod'], { type: 'erp', action: 'teachers' });
  res.json({ ok: true, received: list.length, ...r });
}));

router.put('/students', asyncRoute(async (req, res) => {
  const list = listOf(req.body, 'students');
  const r = await applyStudents(list);
  await logEvent('in', 'students', 'ok', `${list.length} students · ${r.created} new, ${r.updated} updated${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}`);
  res.json({ ok: true, received: list.length, ...r });
}));

router.put('/timetable', asyncRoute(async (req, res) => {
  const list = listOf(req.body, 'entries');
  const r = await applyTimetable(list);
  await logEvent('in', 'timetable', 'ok', `${r.periods} periods in ${r.classes} classes`);
  publish(['all'], { type: 'timetable' });
  res.json({ ok: true, ...r });
}));

router.post('/leaves', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const r = await intakeLeave(body);
  if (r.noClasses) {
    await logEvent('in', 'leave', 'ok', `${r.teacher.name}: no classes on those days, nothing to cover`);
    return res.status(200).json({ ok: true, status: 'no-classes', message: `${r.teacher.name} has no classes then — no cover needed.` });
  }
  if (r.duplicate) return res.json({ ok: true, duplicate: true, ...(await leaveStatus(body.erpRef)) });

  const first = r.leaves[0];
  const label = r.leaves.length > 1 ? `${prettyDate(first.date)} – ${prettyDate(r.leaves[r.leaves.length - 1].date)}` : prettyDate(first.date);
  if (body.approved === true) {
    // already approved in the ERP: start arranging cover now
    const result = await decideLeave(first, 'approve', 'Approved in the school ERP');
    await logEvent('in', 'leave', 'ok', `${r.teacher.name} · ${label} · approved in the ERP → ${result.status}`);
    return res.status(201).json({ ok: true, ...(await leaveStatus(body.erpRef)), result: result.status, note: result.note || null });
  }
  publish(['hod'], { type: 'leave', action: 'new', name: r.teacher.name, urgent: first.date === todayIST(), from: 'erp' });
  await logEvent('in', 'leave', 'ok', `${r.teacher.name} · ${label} · waiting for the HOD`);
  res.status(201).json({ ok: true, ...(await leaveStatus(body.erpRef)) });
}));

router.get('/leaves/:erpRef', asyncRoute(async (req, res) => {
  const s = await leaveStatus(String(req.params.erpRef).slice(0, 80));
  if (!s) return res.status(404).json({ error: 'No leave with that erpRef' });
  res.json(s);
}));

router.get('/covers', asyncRoute(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayIST();
  res.json({ date, covers: await coversOn(date) });
}));

// who ProxyPilot knows, with the ERP ids it has matched (handy while setting up)
router.get('/people', asyncRoute(async (req, res) => {
  const rows = await q(`SELECT name, email, role, erp_id, subjects, class_name FROM users WHERE role IN ('faculty', 'student') ORDER BY role, name`);
  res.json({
    teachers: rows.filter((r) => r.role === 'faculty').map((r) => ({ erpId: r.erp_id, name: r.name, email: r.email, subjects: r.subjects })),
    students: rows.filter((r) => r.role === 'student').map((r) => ({ erpId: r.erp_id, name: r.name, email: r.email, className: r.class_name })),
  });
}));

router.use((req, res) => res.status(404).json({ error: 'Unknown ERP API route — see docs/ERP-API.md' }));

export default router;
