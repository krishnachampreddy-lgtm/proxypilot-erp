import { Router } from 'express';
import { z } from 'zod';
import { Proxies, hydrateProxies } from '../db.js';
import { requireAuth, requireRole, validate } from '../middleware/auth.js';
import { advance } from '../services/matching.js';
import { declineForNoCover } from '../services/cover.js';
import { todayIST, prettyDate, PERIOD_TIMES } from '../services/dates.js';
import { publish } from '../services/live.js';
import { coverCalendar } from '../services/ics.js';
import { addDays } from '../services/dates.js';
import { withSweep, replyBy, replyMinutes } from '../services/escalate.js';
import { emitCover } from '../services/erp.js';

const router = Router();
router.use(requireAuth, requireRole('faculty'));
router.use(withSweep);

// Requests waiting for me + proxies I have accepted
router.get('/mine', async (req, res) => {
  const today = todayIST();
  const waitingRows = await Proxies.where(`offered_to = $1 AND status = 'pending' ORDER BY date, period`, [req.user.id]);
  const [waiting, accepted] = await Promise.all([
    hydrateProxies(waitingRows),
    Proxies.where(`assigned_to = $1 AND date >= $2 AND leave_id IS NOT NULL ORDER BY date, period`, [req.user.id, today]).then(hydrateProxies),
  ]);
  const byId = new Map(waitingRows.map((r) => [r.id, r]));
  const decorate = (p) => ({ ...p, prettyDate: prettyDate(p.date), time: PERIOD_TIMES[p.period], replyBy: byId.has(p._id) ? replyBy(byId.get(p._id)) : null });
  res.json({ waiting: waiting.map(decorate), accepted: accepted.map(decorate), replyMinutes: replyMinutes() });
});

// My cover lectures as a calendar file (last two weeks and everything ahead)
router.get('/calendar.ics', async (req, res) => {
  const rows = await Proxies.where(`assigned_to = $1 AND status = 'accepted' AND date >= $2 AND leave_id IS NOT NULL ORDER BY date, period`, [req.user.id, addDays(todayIST(), -14)]);
  const ics = coverCalendar(await hydrateProxies(rows), { host: req.hostname || 'proxypilot' });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="proxypilot-cover.ics"');
  res.send(ics);
});

const RespondBody = z.object({ action: z.enum(['accept', 'decline']) });

router.post('/:id/respond', validate(RespondBody), async (req, res) => {
  const proxy = await Proxies.byId(Number(req.params.id) || 0);
  if (!proxy) return res.status(404).json({ error: 'Request not found' });
  if (proxy.status !== 'pending' || proxy.offered_to !== req.user.id) {
    return res.status(409).json({ error: 'This request is no longer waiting for you' });
  }

  if (req.body.action === 'accept') {
    proxy.assigned_to = proxy.offered_to;
    proxy.status = 'accepted';
    proxy.history.push({ faculty: proxy.offered_to, action: 'accepted', at: new Date().toISOString() });
  } else {
    advance(proxy, 'declined'); // automatically goes to the next best teacher
  }
  await Proxies.save(proxy);
  if (proxy.status === 'uncovered') {
    // every teacher of this subject said no -> the leave cannot go ahead
    await declineForNoCover(proxy.leave_id, proxy, 'declined');
    publish(['hod', proxy.absent_faculty_id], { type: 'leave', action: 'declined', why: 'no-cover' });
    return res.json({ proxy: null, leaveDeclined: true });
  }
  if (proxy.status === 'accepted') {
    publish(['hod', proxy.absent_faculty_id], { type: 'proxy', action: 'accepted', name: req.user.name, className: proxy.class_name, period: proxy.period });
    publish(['student'], { type: 'timetable' });
    emitCover('cover.assigned', proxy);
  } else {
    emitCover('cover.passed', proxy);
    publish(['hod'], { type: 'proxy', action: 'passed', className: proxy.class_name, period: proxy.period });
    publish([proxy.offered_to], { type: 'proxy', action: 'offered', className: proxy.class_name, period: proxy.period });
  }
  const [updated] = await hydrateProxies([proxy]);
  res.json({ proxy: updated });
});

export default router;
