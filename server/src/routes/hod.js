import { Router } from 'express';
import { z } from 'zod';
import { Proxies, Leaves, Users, Timetable, hydrateProxies, q } from '../db.js';
import { requireAuth, requireRole, validate } from '../middleware/auth.js';
import { decideLeave } from '../services/decide.js';
import { emitCover, getConnection, syncFromErp } from '../services/erp.js';
import { advance } from '../services/matching.js';
import { declineForNoCover } from '../services/cover.js';
import { hodSummary } from '../services/ai.js';
import { todayIST, monthStart, prettyDate, weekday, addDays, PERIOD_TIMES } from '../services/dates.js';
import { seedDatabase } from '../seedData.js';
import { leaveBalance } from '../services/leaveBalance.js';
import { publish } from '../services/live.js';
import { withSweep, replyBy } from '../services/escalate.js';

const router = Router();
router.use(requireAuth, requireRole('hod'));
router.use(withSweep);

async function buildOverview() {
  const today = todayIST();
  const [upcomingRows, leaves, faculty, counts, pendingRows] = await Promise.all([
    Proxies.where('date >= $1 AND leave_id IS NOT NULL ORDER BY date, period', [today]),
    Leaves.upcoming(today),
    Users.faculty(),
    Proxies.monthCounts(monthStart(today), null),
    Leaves.pending(),
  ]);

  // leave requests waiting for the HOD (days of a multi-day leave are grouped into one request)
  const groups = new Map();
  for (const l of pendingRows) {
    const key = l.group_id || `single-${l.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const leaveRequests = [];
  for (const rows of groups.values()) {
    const l = rows[0];
    const last = rows[rows.length - 1];
    const timetable = await Timetable.byFaculty(l.faculty_id);
    const classes = [];
    for (const r of rows) {
      const day = weekday(r.date);
      for (const c of timetable.filter((c) => c.day === day && r.periods.includes(c.period)).sort((a, b) => a.period - b.period)) {
        classes.push({ key: `${r.date}-${c.period}`, day, period: c.period, time: PERIOD_TIMES[c.period], className: c.class_name, subject: c.subject });
      }
    }
    leaveRequests.push({
      _id: l.id,
      date: l.date,
      endDate: last.date,
      days: rows.length,
      prettyDate: rows.length > 1 ? `${prettyDate(l.date)} – ${prettyDate(last.date)}` : prettyDate(l.date),
      reason: l.reason,
      rawText: l.raw_text,
      leaveType: l.leave_type,
      periods: l.periods,
      facultyName: l.faculty_name,
      appliedAt: l.created_at,
      urgent: l.urgent,
      source: l.source || 'app',
      erpRef: l.erp_ref || null,
      balance: leaveBalance(await Leaves.byFaculty(l.faculty_id), String(l.date).slice(0, 4)),
      classes,
    });
  }
  const upcoming = await hydrateProxies(upcomingRows);

  const loadThisMonth = faculty
    .map((f) => ({ name: f.name, count: counts[f.id] || 0 }))
    .sort((a, b) => b.count - a.count);

  const stats = {
    total: upcoming.length,
    covered: upcoming.filter((p) => p.status === 'accepted').length,
    pending: upcoming.filter((p) => p.status === 'pending').length,
    uncovered: upcoming.filter((p) => p.status === 'uncovered').length,
    teachersOnLeave: leaves.length,
    leaveRequests: leaveRequests.length,
  };

  return {
    today,
    stats,
    leaveRequests,
    loadThisMonth,
    leaves: leaves.map((l) => ({ _id: l.id, date: l.date, prettyDate: prettyDate(l.date), reason: l.reason, faculty: { name: l.faculty_name } })),
    proxies: upcoming.map((p, i) => ({ ...p, prettyDate: prettyDate(p.date), time: PERIOD_TIMES[p.period], replyBy: replyBy(upcomingRows[i]) })),
  };
}

router.get('/overview', async (req, res) => {
  res.json(await buildOverview());
});

// Short AI-written summary for the HOD
router.get('/summary', async (req, res) => {
  const o = await buildOverview();
  const summary = await hodSummary({ ...o.stats, loadThisMonth: o.loadThisMonth.slice(0, 4) });
  res.json({ summary });
});

// HOD approves or declines a leave request (a reason is required to decline)
const DecideBody = z
  .object({
    action: z.enum(['approve', 'decline']),
    note: z.string().trim().max(300, 'Keep the reason under 300 characters').optional().default(''),
  })
  .refine((b) => b.action === 'approve' || b.note.length >= 3, { message: 'Please write why you are declining this leave' });

router.post('/leaves/:id/decide', validate(DecideBody), async (req, res) => {
  const leave = await Leaves.byId(Number(req.params.id) || 0);
  if (!leave) return res.status(404).json({ error: 'Leave request not found' });
  if (leave.status !== 'pending') return res.status(409).json({ error: `This leave was already ${leave.status}.` });
  const result = await decideLeave(leave, req.body.action, req.body.note);
  res.json({ ok: true, ...result });
});

// "No reply" button: pass the request to the next best teacher
router.post('/proxies/:id/skip', async (req, res) => {
  const proxy = await Proxies.byId(Number(req.params.id) || 0);
  if (!proxy || proxy.status !== 'pending') return res.status(409).json({ error: 'Request is not pending' });
  const from = proxy.offered_to;
  advance(proxy, 'no-reply');
  await Proxies.save(proxy);
  publish([from], { type: 'proxy', action: 'expired' });
  if (proxy.status === 'uncovered') {
    const note = await declineForNoCover(proxy.leave_id, proxy, 'declined');
    publish([proxy.absent_faculty_id], { type: 'leave', action: 'declined', why: 'no-cover' });
    return res.json({ ok: true, leaveDeclined: true, note });
  }
  emitCover('cover.passed', proxy);
  publish([proxy.offered_to], { type: 'proxy', action: 'offered' });
  res.json({ ok: true });
});

// ---------------- Insights: how the department is doing ----------------
const minutesBetween = (a, b) => (new Date(b) - new Date(a)) / 60000;
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** 100 = every teacher took the same number of proxies, lower = the load is lopsided (1 - Gini) */
const fairness = (counts) => {
  const n = counts.length;
  const sum = counts.reduce((a, b) => a + b, 0);
  if (!n || !sum) return 100;
  let diff = 0;
  for (const a of counts) for (const b of counts) diff += Math.abs(a - b);
  return Math.round((1 - diff / (2 * n * sum)) * 100);
};

router.get('/insights', async (req, res) => {
  const today = todayIST();
  const month = today.slice(0, 7);
  // the last six months, oldest first
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const from = `${months[0]}-01`;
  const [leaves, proxies, faculty] = await Promise.all([
    q(`SELECT l.*, u.name AS faculty_name FROM leaves l JOIN users u ON u.id = l.faculty_id WHERE l.date >= $1 ORDER BY l.date`, [from]),
    q(`SELECT * FROM proxies WHERE date >= $1 AND leave_id IS NOT NULL`, [from]),
    Users.faculty(),
  ]);

  const perMonth = months.map((m) => {
    const ls = leaves.filter((l) => String(l.date).startsWith(m));
    const ps = proxies.filter((p) => String(p.date).startsWith(m));
    return {
      month: m,
      label: new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
      leaves: ls.filter((l) => l.status !== 'declined').length,
      covered: ps.filter((p) => p.status === 'accepted').length,
      uncovered: ps.filter((p) => p.status === 'uncovered').length,
    };
  });

  const mine = proxies.filter((p) => String(p.date).startsWith(month));
  const decided = mine.filter((p) => p.status !== 'pending');
  const accepted = mine.filter((p) => p.status === 'accepted');
  const coverMinutes = [];
  let passedOn = 0;
  let autoPassed = 0;
  let sameSubject = 0;
  for (const p of mine) {
    const h = p.history || [];
    passedOn += h.filter((x) => x.action === 'declined' || x.action === 'no-reply').length;
    autoPassed += h.filter((x) => x.action === 'no-reply' && x.auto).length;
    if (p.status === 'accepted') {
      const first = h.find((x) => x.action === 'offered');
      const ok = h.find((x) => x.action === 'accepted');
      if (first && ok) coverMinutes.push(Math.max(0, minutesBetween(first.at, ok.at)));
      const c = (p.candidates || []).find((c) => c.faculty === p.assigned_to);
      if (c && c.sameSubject !== false) sameSubject++;
    }
  }

  const counts = Object.fromEntries(faculty.map((f) => [f.id, 0]));
  for (const p of accepted) if (p.assigned_to in counts) counts[p.assigned_to]++;
  const load = faculty.map((f) => ({ name: f.name, count: counts[f.id] })).sort((a, b) => b.count - a.count);

  // which weekdays teachers are away most (last 90 days)
  const since = addDays(today, -90);
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = DAYS.map((d) => ({ day: d, leaves: leaves.filter((l) => l.date >= since && l.status !== 'declined' && weekday(l.date) === d).length }));

  const types = { full: 0, morning: 0, afternoon: 0, periods: 0 };
  for (const l of leaves.filter((l) => String(l.date).startsWith(month) && l.status !== 'declined')) types[l.leave_type || 'full'] = (types[l.leave_type || 'full'] || 0) + 1;

  res.json({
    month,
    coverage: decided.length ? Math.round((accepted.length / decided.length) * 100) : null,
    classesCovered: accepted.length,
    waiting: mine.filter((p) => p.status === 'pending').length,
    medianMinutesToCover: coverMinutes.length ? Math.round(median(coverMinutes)) : null,
    passedOn,
    autoPassed,
    sameSubjectRate: accepted.length ? Math.round((sameSubject / accepted.length) * 100) : null,
    fairness: fairness(load.map((l) => l.count)),
    load,
    perMonth,
    byDay,
    types,
  });
});

// ---------------- Today on campus: every class that needs cover today ----------------
router.get('/today', async (req, res) => {
  const today = todayIST();
  const [rows, classRows] = await Promise.all([
    Proxies.where('date = $1 AND leave_id IS NOT NULL ORDER BY period', [today]),
    q('SELECT DISTINCT class_name FROM timetable ORDER BY class_name'),
  ]);
  const list = await hydrateProxies(rows);
  res.json({
    today,
    prettyDate: prettyDate(today),
    allClasses: classRows.map((r) => r.class_name),
    classes: list.map((p, i) => ({
      _id: p._id,
      period: p.period,
      time: PERIOD_TIMES[p.period],
      className: p.className,
      subject: p.subject,
      status: p.status,
      absent: p.absentFaculty?.name,
      substitute: p.assignedTo?.name || null,
      offeredTo: p.status === 'pending' ? p.offeredTo?.name : null,
      replyBy: replyBy(rows[i]),
    })),
  });
});

// Monthly report as a CSV file that opens in Excel
const TYPE_LABEL = { full: 'Full day', morning: 'Morning session', afternoon: 'Afternoon session', periods: 'Selected periods' };
const STATUS_LABEL = { accepted: 'Covered', pending: 'Waiting for reply', uncovered: 'Not covered' };
const cell = (v) => {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

router.get('/report', async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : todayIST().slice(0, 7);
  const from = `${month}-01`;
  const to = `${month}-31`;
  const leaves = await Leaves.inMonth(from, to);
  const proxies = leaves.length
    ? await hydrateProxies(await Proxies.where('leave_id = ANY($1) ORDER BY period', [leaves.map((l) => l.id)]))
    : [];

  const rows = [['Date', 'Teacher', 'Leave type', 'Reason', 'HOD decision', 'HOD note', 'Period', 'Time', 'Class', 'Subject', 'Substitute', 'Cover status']];
  for (const l of leaves) {
    const base = [l.date, l.faculty_name, TYPE_LABEL[l.leave_type] || l.leave_type, l.reason, l.status, l.hod_note || ''];
    const mine = proxies.filter((p) => p.leave === l.id);
    if (mine.length === 0) rows.push([...base, '', '', '', '', '', '']);
    for (const p of mine) {
      rows.push([...base, `P${p.period}`, PERIOD_TIMES[p.period], p.className, p.subject, p.assignedTo?.name || '', STATUS_LABEL[p.status] || p.status]);
    }
  }
  rows.push([]);
  rows.push(['Summary']);
  rows.push(['Leave requests', leaves.length]);
  rows.push(['Approved', leaves.filter((l) => l.status === 'approved').length]);
  rows.push(['Declined', leaves.filter((l) => l.status === 'declined').length]);
  rows.push(['Pending', leaves.filter((l) => l.status === 'pending').length]);
  rows.push(['Classes covered', proxies.filter((p) => p.status === 'accepted').length]);

  const csv = '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="proxypilot-report-${month}.csv"`);
  res.send(csv);
});

// Wipe and reload demo data (handy right before presenting)
router.post('/reset-demo', async (req, res) => {
  await seedDatabase();
  // connected to an ERP: read its staff and timetable again, so the ERP ids match
  const c = await getConnection();
  if (c?.pull_url) await syncFromErp().catch((e) => console.error('[erp] resync after reset:', e.message));
  res.json({ ok: true });
});

export default router;
