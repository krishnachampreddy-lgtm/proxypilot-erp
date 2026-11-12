import { Router } from 'express';
import { q, Users } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { withSweep } from '../services/escalate.js';
import { todayIST, addDays, prettyDate, PERIOD_TIMES } from '../services/dates.js';

/**
 * The bell: recent things that need the user's attention, newest first.
 * Read/unread is kept on the device (last time the bell was opened).
 */
const router = Router();
router.use(requireAuth);
router.use(withSweep);

const iso = (t) => new Date(t).toISOString();
const lastAt = (history, action) => [...(history || [])].reverse().find((h) => h.action === action)?.at;

router.get('/', async (req, res) => {
  const me = await Users.byId(req.user.id);
  const today = todayIST();
  const since = addDays(today, -14);
  const items = [];

  if (me.role === 'faculty') {
    const [waiting, decided, covered] = await Promise.all([
      q(`SELECT p.*, u.name AS absent_name FROM proxies p JOIN users u ON u.id = p.absent_faculty_id
         WHERE p.offered_to = $1 AND p.status = 'pending'`, [me.id]),
      q(`SELECT * FROM leaves WHERE faculty_id = $1 AND status <> 'pending' AND decided_at IS NOT NULL AND date >= $2`, [me.id, since]),
      q(`SELECT p.*, u.name AS sub_name FROM proxies p JOIN users u ON u.id = p.assigned_to
         WHERE p.absent_faculty_id = $1 AND p.status = 'accepted' AND p.date >= $2`, [me.id, today]),
    ]);
    for (const p of waiting) {
      items.push({
        id: `offer-${p.id}-${p.current_index}`,
        at: lastAt(p.history, 'offered') || iso(p.created_at),
        tone: 'brass',
        title: 'A colleague needs your help',
        body: `Cover ${p.class_name} · ${p.subject} on ${prettyDate(p.date)}, P${p.period} (${PERIOD_TIMES[p.period]}) for ${p.absent_name}.`,
      });
    }
    for (const l of decided) {
      const auto = l.hod_note?.startsWith('Declined automatically');
      items.push({
        id: `leave-${l.id}-${l.status}`,
        at: iso(l.decided_at),
        tone: l.status === 'approved' ? 'sage' : 'clay',
        title: l.status === 'approved' ? 'Leave approved' : auto ? 'Leave declined — no cover' : 'Leave declined by HOD',
        body: `${prettyDate(l.date)}${l.hod_note ? ` · ${l.hod_note.replace('Declined automatically: ', '')}` : ''}`,
      });
    }
    for (const p of covered) {
      items.push({
        id: `covered-${p.id}`,
        at: lastAt(p.history, 'accepted') || iso(p.created_at),
        tone: 'sage',
        title: 'Your class is covered',
        body: `${p.sub_name} will take ${p.class_name} on ${prettyDate(p.date)}, P${p.period}.`,
      });
    }
  }

  if (me.role === 'hod') {
    const [pending, autoDeclined] = await Promise.all([
      q(`SELECT l.*, u.name AS faculty_name FROM leaves l JOIN users u ON u.id = l.faculty_id WHERE l.status = 'pending'`),
      q(`SELECT l.*, u.name AS faculty_name FROM leaves l JOIN users u ON u.id = l.faculty_id
         WHERE l.status = 'declined' AND l.hod_note LIKE 'Declined automatically%' AND l.date >= $1`, [since]),
    ]);
    const seen = new Set();
    for (const l of pending) {
      const key = l.group_id || l.id;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: `request-${key}`,
        at: iso(l.created_at),
        tone: l.urgent ? 'clay' : 'brass',
        title: l.urgent ? `Urgent: ${l.faculty_name} is unwell today` : `New leave request from ${l.faculty_name}`,
        body: `${prettyDate(l.date)}${l.group_id ? ' (several days)' : ''} · ${l.reason || 'Leave'}`,
      });
    }
    for (const l of autoDeclined) {
      items.push({
        id: `auto-${l.id}`,
        at: iso(l.decided_at),
        tone: 'clay',
        title: `No cover found for ${l.faculty_name}`,
        body: `${prettyDate(l.date)} · ${l.hod_note.replace('Declined automatically: ', '')}`,
      });
    }
  }

  if (me.role === 'student' && me.class_name) {
    const changes = await q(
      `SELECT p.*, u.name AS sub_name FROM proxies p LEFT JOIN users u ON u.id = p.assigned_to
       WHERE p.class_name = $1 AND p.date >= $2 AND p.date <= $3 AND p.leave_id IS NOT NULL`,
      [me.class_name, today, addDays(today, 1)]
    );
    for (const p of changes) {
      items.push({
        id: `class-${p.id}-${p.status}`,
        at: lastAt(p.history, p.status === 'accepted' ? 'accepted' : 'offered') || iso(p.created_at),
        tone: p.status === 'accepted' ? 'sage' : 'brass',
        title: p.status === 'accepted' ? 'Substitute teacher' : 'Teacher on leave',
        body:
          p.status === 'accepted'
            ? `${p.sub_name} will take ${p.subject} on ${prettyDate(p.date)}, P${p.period}.`
            : `${p.subject} on ${prettyDate(p.date)}, P${p.period} — a substitute is being arranged.`,
      });
    }
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  res.json({ items: items.slice(0, 20) });
});

export default router;
