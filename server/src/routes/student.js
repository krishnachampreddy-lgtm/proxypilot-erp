import { Router } from 'express';
import { Timetable, Proxies, Users } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { todayIST, addDays, weekday, prettyDate, PERIOD_TIMES } from '../services/dates.js';

const router = Router();
router.use(requireAuth, requireRole('student'));

// My class timetable for today and tomorrow, with substitutes shown
router.get('/schedule', async (req, res) => {
  const me = await Users.byId(req.user.id);
  const names = await Users.nameMap();
  const today = todayIST();
  const days = [];
  for (const date of [today, addDays(today, 1)]) {
    const day = weekday(date);
    const [slots, proxies] = await Promise.all([
      Timetable.classDay(me.class_name, day),
      Proxies.where('class_name = $1 AND date = $2', [me.class_name, date]),
    ]);
    days.push({
      date,
      prettyDate: prettyDate(date),
      periods: slots.map((s) => {
        const p = proxies.find((x) => x.period === s.period);
        return {
          period: s.period,
          time: PERIOD_TIMES[s.period],
          subject: s.subject,
          teacher: s.faculty_name,
          change: p
            ? p.status === 'accepted'
              ? { type: 'substitute', text: `${names[p.assigned_to]} will take this class` }
              : p.status === 'pending'
                ? { type: 'pending', text: 'Teacher on leave — substitute being arranged' }
                : { type: 'free', text: 'Teacher on leave — free period / library' }
            : null,
        };
      }),
    });
  }
  res.json({ className: me.class_name, days });
});

export default router;
