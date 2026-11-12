import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { getPool, q, Users, Leaves, Timetable, Proxies } from '../db.js';
import { todayIST, weekday, prettyDate, addDays, PERIOD_TIMES } from './dates.js';

/*
  The school ERP connection.
  ProxyPilot works as an extension of the school's own ERP (Teachmint, Entab, Fedena, an in-house system…):
    in  — the ERP sends (or ProxyPilot reads) teachers, students and the weekly timetable, and teachers' leaves
    out — ProxyPilot sends every leave decision and cover change back to the ERP as signed webhooks
  One school per ProxyPilot site, so the connection is a single row.
*/

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const ERP_EVENTS = ['leave.approved', 'leave.declined', 'cover.assigned', 'cover.passed', 'cover.failed'];

// ---------------- secrets at rest ----------------
// Keys the server must read back (the ERP's key, the webhook secret) are encrypted with AES-256-GCM.
const secretKey = () =>
  crypto.createHash('sha256').update(`proxypilot-erp:${process.env.JWT_SECRET || process.env.SITE_ID || 'local'}`).digest();

export function seal(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function unseal(blob) {
  if (!blob) return null;
  try {
    const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null; // the server secret changed: treat as not set
  }
}

export const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
export const newApiKey = () => `pp_live_${crypto.randomBytes(24).toString('base64url')}`;
export const newWebhookSecret = () => `whsec_${crypto.randomBytes(24).toString('base64url')}`;

export function sameHash(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** HMAC signature of one webhook: sha256 over "<timestamp>.<raw body>" */
export const signBody = (secret, timestamp, body) => crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

// ---------------- the connection row ----------------
export async function getConnection() {
  return (await q('SELECT * FROM erp_connection WHERE id = 1'))[0] || null;
}

export async function saveConnection(fields) {
  await q('INSERT INTO erp_connection (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const keys = Object.keys(fields);
  if (!keys.length) return getConnection();
  const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  await q(`UPDATE erp_connection SET ${set}, updated_at = NOW() WHERE id = 1`, keys.map((k) => fields[k]));
  return getConnection();
}

/** What the HOD's ERP page shows (never the secrets themselves) */
export function publicConnection(c) {
  if (!c) return { connected: false };
  return {
    connected: Boolean(c.api_key_hash || c.pull_url || c.webhook_url),
    erpName: c.erp_name,
    isDemo: c.is_demo,
    pullUrl: c.pull_url,
    hasPullKey: Boolean(c.pull_key_enc),
    apiKeyHint: c.api_key_hint,
    hasApiKey: Boolean(c.api_key_hash),
    webhookUrl: c.webhook_url,
    hasWebhookSecret: Boolean(c.webhook_secret_enc),
    lastSyncAt: c.last_sync_at,
    lastSync: c.last_sync,
  };
}

// ---------------- activity log ----------------
export async function logEvent(direction, kind, status, detail, payload = null, attempts = 1) {
  const [row] = await q(
    `INSERT INTO erp_events (direction, kind, status, detail, payload, attempts) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [direction, kind, status, detail ? String(detail).slice(0, 500) : null, payload ? JSON.stringify(payload) : null, attempts]
  );
  // keep the log small
  await q(`DELETE FROM erp_events WHERE id < (SELECT COALESCE(MAX(id), 0) - 500 FROM erp_events)`);
  return row.id;
}

export const recentEvents = (limit = 40) =>
  q(`SELECT id, direction, kind, status, detail, attempts, created_at FROM erp_events ORDER BY id DESC LIMIT $1`, [limit]);

// ---------------- URLs the HOD types in ----------------
/** Only https (or this site itself / a local machine while developing), never private network addresses. */
export function checkUrl(raw, ownOrigin) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw new Error('That is not a valid web address.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  const own = ownOrigin && u.origin === ownOrigin;
  const hosted = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
  if (u.protocol !== 'https:' && !(own || (local && !hosted))) {
    throw new Error('Use an https:// address for the ERP.');
  }
  const privateIp = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.)/.test(u.hostname);
  if (!own && ((local && hosted) || privateIp)) {
    throw new Error('Private network addresses are not allowed.');
  }
  return u.toString().replace(/\/$/, '');
}

// ---------------- people: ids both systems understand ----------------
async function peopleMap() {
  const rows = await q('SELECT id, name, erp_id FROM users');
  return new Map(rows.map((r) => [r.id, { name: r.name, erpId: r.erp_id || null }]));
}

const person = (map, id) => (id ? { erpId: map.get(id)?.erpId ?? null, name: map.get(id)?.name ?? null } : null);

/** One cover (proxy) in the shape the ERP receives */
export async function coverForErp(p, map = null) {
  map ||= await peopleMap();
  const leave = p.leave_id ? await Leaves.byId(p.leave_id) : null;
  return {
    coverId: p.id,
    leaveId: p.leave_id,
    erpLeaveRef: leave?.erp_ref || null,
    date: p.date,
    day: p.day,
    period: p.period,
    time: PERIOD_TIMES[p.period],
    className: p.class_name,
    subject: p.subject,
    absentTeacher: person(map, p.absent_faculty_id),
    substitute: p.status === 'accepted' ? person(map, p.assigned_to) : null,
    askedNow: p.status === 'pending' ? person(map, p.offered_to) : null,
    status: p.status,
    reason: p.ai_reason || null,
    handoverNote: p.handover_note || null,
  };
}

// ---------------- webhooks: ProxyPilot -> ERP ----------------
const RETRY_MS = [0, 20_000, 60_000];

/** Send one signed update to the ERP's webhook URL (retried twice if the ERP is down). */
export async function emit(event, data) {
  try {
    const c = await getConnection();
    if (!c?.webhook_url) return;
    const secret = unseal(c.webhook_secret_enc);
    const body = JSON.stringify({ id: `evt_${randomUUID()}`, event, createdAt: new Date().toISOString(), data });
    const id = await logEvent('out', event, 'sending', describe(event, data), JSON.parse(body), 0);
    deliver(c.webhook_url, secret, event, body, id, 0);
  } catch (e) {
    console.error('[erp] emit', e.message);
  }
}

async function deliver(url, secret, event, body, logId, attempt) {
  const ts = Math.floor(Date.now() / 1000).toString();
  let ok = false;
  let note = '';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ProxyPilot-Webhooks/1.0',
        'X-ProxyPilot-Event': event,
        'X-ProxyPilot-Timestamp': ts,
        ...(secret ? { 'X-ProxyPilot-Signature': `sha256=${signBody(secret, ts, body)}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    ok = res.ok;
    note = `HTTP ${res.status}`;
  } catch (e) {
    note = e.name === 'TimeoutError' ? 'no answer in 8 s' : e.message;
  }
  const last = attempt + 1 >= RETRY_MS.length;
  await q(`UPDATE erp_events SET status = $2, attempts = $3, detail = CONCAT(SPLIT_PART(detail, ' | ', 1), ' | ', $4::text) WHERE id = $1`, [
    logId,
    ok ? 'ok' : last ? 'failed' : 'sending',
    attempt + 1,
    ok ? `delivered (${note})` : last ? `not delivered (${note})` : `retrying (${note})`,
  ]).catch(() => {});
  if (!ok && !last) setTimeout(() => deliver(url, secret, event, body, logId, attempt + 1), RETRY_MS[attempt + 1]).unref?.();
}

function describe(event, d) {
  if (event.startsWith('cover.')) {
    const who = d.substitute?.name || d.askedNow?.name;
    return `${d.className} P${d.period} ${prettyDate(d.date)}${who ? ` → ${who}` : ''}`;
  }
  if (event.startsWith('leave.')) return `${d.teacher?.name || 'Teacher'} · ${d.dates?.length > 1 ? `${d.dates.length} days` : prettyDate(d.dates?.[0] || d.date)}`;
  return event;
}

/** A cover changed: tell the ERP */
export async function emitCover(event, proxyRow) {
  const c = await getConnection().catch(() => null);
  if (!c?.webhook_url) return;
  emit(event, await coverForErp(proxyRow));
}

/** A leave was decided: tell the ERP (rows = every day of the request) */
export async function emitLeave(event, rows, note = null) {
  const c = await getConnection().catch(() => null);
  if (!c?.webhook_url || !rows.length) return;
  const map = await peopleMap();
  const first = rows[0];
  const covers = event === 'leave.approved' ? await Proxies.where('leave_id = ANY($1) ORDER BY date, period', [rows.map((r) => r.id)]) : [];
  emit(event, {
    leaveIds: rows.map((r) => r.id),
    erpLeaveRef: first.erp_ref || null,
    source: first.source || 'app',
    teacher: person(map, first.faculty_id),
    dates: rows.map((r) => r.date),
    leaveType: first.leave_type,
    reason: first.reason,
    note: note || first.hod_note || null,
    classes: covers.map((p) => ({ coverId: p.id, date: p.date, period: p.period, className: p.class_name, subject: p.subject, askedFirst: person(map, p.offered_to) })),
  });
}

// ---------------- data from the ERP ----------------
const clean = (s, max = 120) => String(s ?? '').trim().slice(0, max);
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Teachers: matched by the ERP's id first, then by email. Nobody is deleted. */
export async function applyTeachers(list) {
  const out = { created: 0, updated: 0, skipped: [] };
  for (const t of list) {
    const erpId = clean(t.erpId, 64);
    const email = clean(t.email, 200).toLowerCase();
    const name = clean(t.name);
    const subjects = (Array.isArray(t.subjects) ? t.subjects : []).map((s) => clean(s, 40)).filter(Boolean).slice(0, 12);
    if (!erpId || !name || !emailOk(email)) {
      out.skipped.push(erpId || email || name || '?');
      continue;
    }
    const existing = (await q('SELECT * FROM users WHERE erp_id = $1', [erpId]))[0] || (await Users.byEmail(email));
    if (existing) {
      if (existing.role === 'hod') {
        out.skipped.push(erpId);
        continue;
      }
      await q(`UPDATE users SET erp_id = $2, name = $3, email = $4, subjects = $5, role = 'faculty', needs_profile = FALSE WHERE id = $1`, [
        existing.id, erpId, name, email, subjects,
      ]);
      out.updated++;
    } else {
      await q(`INSERT INTO users (name, email, role, subjects, erp_id, needs_profile) VALUES ($1,$2,'faculty',$3,$4,FALSE)`, [name, email, subjects, erpId]);
      out.created++;
    }
  }
  return out;
}

export async function applyStudents(list) {
  const out = { created: 0, updated: 0, skipped: [] };
  for (const s of list) {
    const erpId = clean(s.erpId, 64);
    const email = clean(s.email, 200).toLowerCase();
    const name = clean(s.name);
    const className = clean(s.className, 40);
    if (!erpId || !name || !emailOk(email) || !className) {
      out.skipped.push(erpId || email || name || '?');
      continue;
    }
    const existing = (await q('SELECT * FROM users WHERE erp_id = $1', [erpId]))[0] || (await Users.byEmail(email));
    if (existing) {
      if (existing.role !== 'student') {
        out.skipped.push(erpId);
        continue;
      }
      await q(`UPDATE users SET erp_id = $2, name = $3, email = $4, class_name = $5, needs_profile = FALSE WHERE id = $1`, [existing.id, erpId, name, email, className]);
      out.updated++;
    } else {
      await q(`INSERT INTO users (name, email, role, class_name, erp_id, needs_profile) VALUES ($1,$2,'student',$3,$4,FALSE)`, [name, email, className, erpId]);
      out.created++;
    }
  }
  return out;
}

/** The weekly timetable: the ERP's copy replaces ProxyPilot's in one go (all or nothing). */
export async function applyTimetable(entries) {
  const users = await q(`SELECT id, erp_id, email FROM users WHERE role = 'faculty'`);
  const byErp = new Map(users.filter((u) => u.erp_id).map((u) => [u.erp_id, u.id]));
  const byEmail = new Map(users.map((u) => [u.email, u.id]));
  const rows = [];
  const problems = [];
  const seen = new Set();
  entries.forEach((e, i) => {
    const day = clean(e.day, 3);
    const period = Number(e.period);
    const className = clean(e.className, 40);
    const subject = clean(e.subject, 40);
    const fid = byErp.get(clean(e.teacherErpId, 64)) || byEmail.get(clean(e.teacherEmail, 200).toLowerCase());
    const where = `entry ${i + 1}`;
    if (!DAYS.includes(day)) return problems.push(`${where}: day must be one of ${DAYS.join(', ')}`);
    if (!(period >= 1 && period <= 6)) return problems.push(`${where}: period must be 1–6`);
    if (!className || !subject) return problems.push(`${where}: className and subject are needed`);
    if (!fid) return problems.push(`${where}: unknown teacher ${e.teacherErpId || e.teacherEmail || ''} (send the teachers first)`);
    const clash = `${day}-${period}-${fid}`;
    if (seen.has(clash)) return problems.push(`${where}: that teacher already has a class on ${day} period ${period}`);
    seen.add(clash);
    rows.push([day, period, className, subject, clean(e.topic, 200) || null, fid]);
  });
  if (problems.length) {
    const err = new Error(`Timetable not changed: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}`);
    err.status = 400;
    throw err;
  }
  if (!rows.length) {
    const err = new Error('Timetable not changed: no entries were sent.');
    err.status = 400;
    throw err;
  }
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM timetable');
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const values = chunk.map((_, j) => `($${j * 6 + 1},$${j * 6 + 2},$${j * 6 + 3},$${j * 6 + 4},$${j * 6 + 5},$${j * 6 + 6})`).join(',');
      await client.query(`INSERT INTO timetable (day, period, class_name, subject, current_topic, faculty_id) VALUES ${values}`, chunk.flat());
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { periods: rows.length, classes: new Set(rows.map((r) => r[2])).size, teachers: new Set(rows.map((r) => r[5])).size };
}

/**
 * A leave the teacher applied for in the ERP.
 * approved: true  -> the ERP already approved it; ProxyPilot starts arranging cover at once
 * approved: false -> it waits for the HOD in ProxyPilot, like a leave applied here
 * The same erpRef sent twice returns the first result (safe to retry).
 */
export async function intakeLeave(body) {
  const erpRef = clean(body.erpRef, 80);
  if (!erpRef) throw httpError(400, 'erpRef is needed (the ERP’s own id for this leave)');
  const earlier = await q('SELECT * FROM leaves WHERE erp_ref = $1 ORDER BY date', [erpRef]);
  if (earlier.length) return { duplicate: true, leaves: earlier };

  const teacher =
    (body.teacherErpId && (await q(`SELECT * FROM users WHERE erp_id = $1 AND role = 'faculty'`, [clean(body.teacherErpId, 64)]))[0]) ||
    (body.teacherEmail && (await Users.byEmail(clean(body.teacherEmail, 200)))) ||
    null;
  if (!teacher || teacher.role !== 'faculty') throw httpError(404, 'Unknown teacher — send the teachers first (PUT /api/v1/teachers)');

  const date = clean(body.date, 10);
  const endDate = clean(body.endDate || body.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date) throw httpError(400, 'date / endDate must be YYYY-MM-DD');
  const today = todayIST();
  if (date < today) throw httpError(400, 'The leave starts in the past');
  if (endDate > addDays(date, 30)) throw httpError(400, 'One leave can be at most a month long');
  if (endDate > addDays(today, 120)) throw httpError(400, 'Dates must be within the next 4 months');
  const session = ['full', 'morning', 'afternoon', 'periods'].includes(body.session) ? body.session : 'full';
  const wanted = Array.isArray(body.periods) ? body.periods.map(Number).filter((n) => n >= 1 && n <= 6) : [];
  if (session === 'periods' && !wanted.length) throw httpError(400, 'session "periods" needs a periods list, e.g. [1, 3]');

  const myClasses = await Timetable.byFaculty(teacher.id);
  const mine = await Leaves.byFaculty(teacher.id);
  const taken = new Set(mine.filter((l) => l.status !== 'declined').map((l) => l.date));
  const days = [];
  for (let d = date; d <= endDate; d = addDays(d, 1)) {
    const key = weekday(d);
    if (key === 'Sun') continue;
    if (taken.has(d)) throw httpError(409, `${teacher.name} already has a leave on ${d}`);
    let periods = myClasses.filter((c) => c.day === key).map((c) => c.period);
    if (session === 'morning') periods = periods.filter((p) => p <= 4);
    if (session === 'afternoon') periods = periods.filter((p) => p >= 5);
    if (session === 'periods') periods = periods.filter((p) => wanted.includes(p));
    if (periods.length) days.push({ date: d, periods: [...new Set(periods)].sort((a, b) => a - b) });
  }
  if (!days.length) return { noClasses: true, teacher };

  const reason = clean(body.reason, 120) || 'Leave';
  const groupId = days.length > 1 ? randomUUID() : null;
  const created = [];
  for (const d of days) {
    const leave = await Leaves.create({
      facultyId: teacher.id,
      date: d.date,
      rawText: clean(body.note || body.reason, 500) || `Leave from the school ERP (${erpRef})`,
      reason,
      periods: d.periods,
      aiUsed: false,
      leaveType: days.length > 1 ? 'full' : session,
      groupId,
      urgent: d.date === today,
    });
    await q(`UPDATE leaves SET source = 'erp', erp_ref = $2 WHERE id = $1`, [leave.id, erpRef]);
    created.push({ ...leave, source: 'erp', erp_ref: erpRef });
  }
  return { teacher, leaves: created };
}

/** A leave's days with their covers, for GET /api/v1/leaves/:erpRef */
export async function leaveStatus(erpRef) {
  const rows = await q('SELECT * FROM leaves WHERE erp_ref = $1 ORDER BY date', [erpRef]);
  if (!rows.length) return null;
  const map = await peopleMap();
  const covers = await Proxies.where('leave_id = ANY($1) ORDER BY date, period', [rows.map((r) => r.id)]);
  return {
    erpLeaveRef: erpRef,
    teacher: person(map, rows[0].faculty_id),
    status: rows.every((r) => r.status === rows[0].status) ? rows[0].status : 'mixed',
    days: rows.map((r) => ({ date: r.date, status: r.status, periods: r.periods, note: r.hod_note })),
    covers: await Promise.all(covers.map((p) => coverForErp(p, map))),
  };
}

export async function coversOn(date) {
  const map = await peopleMap();
  const rows = await Proxies.where('date = $1 AND leave_id IS NOT NULL ORDER BY period, class_name', [date]);
  return Promise.all(rows.map((p) => coverForErp(p, map)));
}

// ---------------- reading from the ERP's API ----------------
async function erpGet(base, key, path) {
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}), 'User-Agent': 'ProxyPilot-Sync/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${path} answered HTTP ${res.status}`);
  return res.json();
}

/** "Sync now": read teachers, students and the timetable from the ERP, in that order. */
export async function syncFromErp() {
  const c = await getConnection();
  if (!c?.pull_url) throw httpError(400, 'Add the ERP’s API address first.');
  const key = unseal(c.pull_key_enc);
  const started = Date.now();
  try {
    const [t, s, tt] = [await erpGet(c.pull_url, key, '/teachers'), await erpGet(c.pull_url, key, '/students'), await erpGet(c.pull_url, key, '/timetable')];
    const teachers = await applyTeachers(t.teachers || []);
    const students = await applyStudents(s.students || []);
    const timetable = await applyTimetable(tt.entries || []);
    const summary = {
      teachers: (t.teachers || []).length,
      students: (s.students || []).length,
      periods: timetable.periods,
      classes: timetable.classes,
      created: teachers.created + students.created,
      skipped: [...teachers.skipped, ...students.skipped].length,
      ms: Date.now() - started,
    };
    await saveConnection({ last_sync_at: new Date(), last_sync: JSON.stringify(summary) });
    await logEvent('in', 'sync', 'ok', `${plural(summary.teachers, 'teacher')}, ${plural(summary.students, 'student')}, ${plural(summary.periods, 'period')} in ${plural(summary.classes, 'class', 'classes')}`, summary);
    return summary;
  } catch (e) {
    await logEvent('in', 'sync', 'failed', e.message);
    throw httpError(e.status || 502, `Sync failed: ${e.message}`);
  }
}

const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export { DAYS as ERP_DAYS, prettyDate };
