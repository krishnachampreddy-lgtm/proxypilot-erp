import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Leaves, Proxies, Timetable, Users, hydrateProxies } from '../db.js';
import { ensureStarterTimetable } from '../services/starterTimetable.js';
import { requireAuth, requireRole, validate } from '../middleware/auth.js';
import { parseLeave } from '../services/ai.js';
import { leaveBalance, leaveCost } from '../services/leaveBalance.js';
import { todayIST, weekday, prettyDate, addDays, PERIOD_TIMES } from '../services/dates.js';
import { publish } from '../services/live.js';

const router = Router();
router.use(requireAuth, requireRole('faculty'));

const LeaveBody = z
  .object({
    text: z.string().trim().max(500, 'Keep it under 500 characters').optional().default(''),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid end date').optional(),
    periods: z.array(z.number().int().min(1).max(6)).max(6).optional(),
    session: z.enum(['full', 'morning', 'afternoon', 'periods']).optional(),
    urgent: z.boolean().optional(),
  })
  .refine((b) => b.date || b.text.length >= 5, { message: 'Pick a date on the calendar or describe your leave' });

/**
 * Apply for leave: free text or a calendar date -> classes found -> sent to the HOD for approval.
 * After approval, services/cover.js ranks substitutes and sends the requests.
 */
router.post('/', validate(LeaveBody), async (req, res) => {
  const today = todayIST();
  await ensureStarterTimetable(await Users.byId(req.user.id));
  const myClasses = await Timetable.byFaculty(req.user.id);
  const scheduleText = myClasses.map((c) => `${c.day} P${c.period} ${c.class_name} ${c.subject}`).join('; ');

  // 1. Read the message; a date picked on the calendar always wins
  const { text, periods, session, endDate, urgent } = req.body;
  const date = urgent ? today : req.body.date; // "I'm sick today" is always for today
  if (date && (date < today || date > addDays(today, 120))) {
    return res.status(400).json({ error: 'Pick a date between today and the next 4 months.' });
  }
  if (date && endDate && endDate > date) return applyMultiDay(req, res, myClasses);
  const parsed = text.length >= 3 ? await parseLeave(text, today, scheduleText) : { date: today, periods: [], reason: 'Leave', aiUsed: false };
  if (date) {
    parsed.date = date;
    parsed.periods = periods?.length ? periods : [];
  }
  const day = weekday(parsed.date);
  if (day === 'Sun') return res.status(400).json({ error: `${prettyDate(parsed.date)} is a Sunday — no classes.` });

  if (await Leaves.exists(req.user.id, parsed.date)) {
    return res.status(409).json({ error: `You already applied leave for ${prettyDate(parsed.date)}.` });
  }

  // 2. Match to the timetable: full day, a session, or chosen periods
  let affected = myClasses.filter((c) => c.day === day);
  let leaveType = session || (parsed.periods.length ? 'periods' : 'full');
  if (leaveType === 'morning') affected = affected.filter((c) => c.period <= 4);
  else if (leaveType === 'afternoon') affected = affected.filter((c) => c.period >= 5);
  else if (leaveType === 'periods' && parsed.periods.length) affected = affected.filter((c) => parsed.periods.includes(c.period));
  else leaveType = 'full';
  if (affected.length === 0) {
    return res.status(400).json({
      error: `You have no classes on ${prettyDate(parsed.date)}${parsed.periods.length ? ` in period ${parsed.periods.join(', ')}` : ''}. No proxy needed!`,
    });
  }

  // 3. Check the yearly leave balance
  const year = parsed.date.slice(0, 4);
  const balance = leaveBalance(await Leaves.byFaculty(req.user.id), year);
  if (balance.left < leaveCost(leaveType)) {
    return res.status(400).json({ error: `You have ${balance.left} of ${balance.total} leaves left for ${year}. Not enough for this request.` });
  }

  const leave = await Leaves.create({
    facultyId: req.user.id,
    date: parsed.date,
    rawText: text || `Leave on ${prettyDate(parsed.date)}`,
    reason: parsed.reason,
    periods: affected.map((c) => c.period),
    aiUsed: parsed.aiUsed,
    leaveType,
    urgent: Boolean(urgent),
  });

  // 4. Goes to the HOD first; cover is arranged only after approval
  publish(['hod'], { type: 'leave', action: 'new', name: req.user.name, urgent: Boolean(urgent) });
  res.status(201).json({
    leave: { ...leave, _id: leave.id },
    status: 'pending',
    understood: {
      date: parsed.date,
      prettyDate: prettyDate(parsed.date),
      periods: leave.periods,
      reason: parsed.reason,
      leaveType,
    },
  });
});

/**
 * Leave for several days in a row (full days). Sundays and days without classes are skipped.
 * Every day is stored as its own leave (so each day gets its own cover) but they share a group id,
 * so the HOD sees and decides one request.
 */
async function applyMultiDay(req, res, myClasses) {
  const { date, endDate, text } = req.body;
  if (endDate > addDays(date, 30)) return res.status(400).json({ error: 'A single leave can be at most one month long.' });
  if (endDate > addDays(todayIST(), 120)) return res.status(400).json({ error: 'Pick dates within the next 4 months.' });

  const mine = await Leaves.byFaculty(req.user.id);
  const taken = new Set(mine.filter((l) => l.status !== 'declined').map((l) => l.date));
  const days = [];
  for (let d = date; d <= endDate; d = addDays(d, 1)) {
    const key = weekday(d);
    if (key === 'Sun') continue;
    if (taken.has(d)) return res.status(409).json({ error: `You already applied leave for ${prettyDate(d)}.` });
    const classes = myClasses.filter((c) => c.day === key);
    if (classes.length) days.push({ date: d, periods: classes.map((c) => c.period).sort((a, b) => a - b) });
  }
  if (days.length === 0) return res.status(400).json({ error: 'You have no classes on these days. No proxy needed!' });

  const year = date.slice(0, 4);
  const balance = leaveBalance(mine, year);
  if (balance.left < days.length) {
    return res.status(400).json({ error: `This needs ${days.length} leaves but you have ${balance.left} of ${balance.total} left for ${year}.` });
  }

  let reason = text.length >= 3 ? (await parseLeave(text, date, '')).reason : 'Leave';
  if (reason === 'Leave' && text.length >= 3) reason = text.length > 60 ? `${text.slice(0, 57)}…` : text;
  const groupId = randomUUID();
  const label = `${prettyDate(date)} – ${prettyDate(endDate)}`;
  for (const d of days) {
    await Leaves.create({
      facultyId: req.user.id,
      date: d.date,
      rawText: text || `Leave from ${label}`,
      reason,
      periods: d.periods,
      aiUsed: false,
      leaveType: 'full',
      groupId,
    });
  }
  publish(['hod'], { type: 'leave', action: 'new', name: req.user.name, days: days.length });
  res.status(201).json({
    status: 'pending',
    understood: { date, endDate, prettyDate: label, days: days.length, periods: [], reason, leaveType: 'full' },
  });
}

// For the calendar: my weekly classes + dates I already took leave
router.get('/schedule', async (req, res) => {
  await ensureStarterTimetable(await Users.byId(req.user.id));
  const [classes, leaves] = await Promise.all([Timetable.byFaculty(req.user.id), Leaves.byFaculty(req.user.id)]);
  res.json({
    today: todayIST(),
    classes: classes.map((c) => ({ day: c.day, period: c.period, time: PERIOD_TIMES[c.period], className: c.class_name, subject: c.subject })),
    leaveDates: leaves.filter((l) => l.status !== 'declined').map((l) => l.date),
    balance: leaveBalance(leaves, todayIST().slice(0, 4)),
  });
});

// My leaves and how each class is being covered
router.get('/mine', async (req, res) => {
  await ensureStarterTimetable(await Users.byId(req.user.id));
  const leaves = await Leaves.byFaculty(req.user.id);
  const proxies = await hydrateProxies(await Proxies.where('absent_faculty_id = $1 ORDER BY period', [req.user.id]));
  res.json({
    leaves: leaves.map((l) => ({
      _id: l.id,
      date: l.date,
      prettyDate: prettyDate(l.date),
      rawText: l.raw_text,
      reason: l.reason,
      periods: l.periods,
      leaveType: l.leave_type,
      status: l.status,
      hodNote: l.hod_note,
      urgent: l.urgent,
      groupId: l.group_id,
      groupDays: l.group_id ? leaves.filter((x) => x.group_id === l.group_id).length : 1,
      proxies: proxies.filter((p) => p.leave === l.id),
    })),
    balance: leaveBalance(leaves, todayIST().slice(0, 4)),
  });
});

// My year at a glance: leaves used, proxies taken, classes covered for me
router.get('/summary', async (req, res) => {
  const today = todayIST();
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const [leaves, took, coveredForMe] = await Promise.all([
    Leaves.byFaculty(req.user.id),
    Proxies.where(`assigned_to = $1 AND status = 'accepted' AND date LIKE $2`, [req.user.id, `${year}%`]),
    Proxies.where(`absent_faculty_id = $1 AND status = 'accepted' AND date LIKE $2`, [req.user.id, `${year}%`]),
  ]);
  const thisYear = leaves.filter((l) => String(l.date).startsWith(year));
  const days = (rows) => rows.reduce((s, l) => s + leaveCost(l.leave_type), 0);
  res.json({
    year,
    balance: leaveBalance(leaves, year),
    leavesTaken: days(thisYear.filter((l) => l.status === 'approved')),
    leavesPending: days(thisYear.filter((l) => l.status === 'pending')),
    leavesDeclined: thisYear.filter((l) => l.status === 'declined').length,
    proxiesThisYear: took.length,
    proxiesThisMonth: took.filter((p) => String(p.date).startsWith(month)).length,
    coveredForMe: coveredForMe.length,
  });
});

// Withdraw a leave that the HOD has not decided yet
router.post('/:id/cancel', async (req, res) => {
  const leave = await Leaves.byId(Number(req.params.id) || 0);
  if (!leave || leave.faculty_id !== req.user.id) return res.status(404).json({ error: 'Leave not found' });
  if (leave.status !== 'pending') return res.status(409).json({ error: `This leave was already ${leave.status} and can't be cancelled.` });
  for (const l of await Leaves.sameGroup(leave)) await Leaves.remove(l.id);
  publish(['hod'], { type: 'leave', action: 'cancelled', name: req.user.name });
  res.json({ ok: true });
});

export default router;
