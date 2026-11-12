import { Users, Timetable, Leaves, Proxies } from '../db.js';
import { monthStart } from './dates.js';

const MAX_PERIODS_PER_DAY = 5;

/**
 * Rank every possible substitute for one class.
 * Rules:
 *   must  - free in that period, not on leave that day, under the daily limit
 *   order - teachers of the same subject always come first; other subjects are the backup
 *   +20   - already teaches that class
 *   +10   - minus 4 per proxy taken this month  (fairness)
 *   -5    - per period already busy that day     (workload)
 */
export async function rankCandidates({ date, day, period, className, subject, absentFacultyId }) {
  const [faculty, busySlots, onLeave, proxiesToday, monthCount, classTeachers] = await Promise.all([
    Users.faculty(),
    Timetable.busyFaculty(day, period),
    Leaves.facultyOnDate(date),
    Proxies.where(`date = $1 AND status <> 'uncovered'`, [date]),
    Proxies.monthCounts(monthStart(date), date),
    Timetable.facultyOfClass(className),
  ]);

  const busy = new Set(busySlots);
  const leave = new Set(onLeave);
  const teachesClass = new Set(classTeachers);
  const takenThisPeriod = new Set(
    proxiesToday.filter((p) => p.period === period).map((p) => p.assigned_to || p.offered_to).filter(Boolean)
  );

  const ranked = [];
  for (const f of faculty) {
    if (f.id === absentFacultyId || busy.has(f.id) || leave.has(f.id) || takenThisPeriod.has(f.id)) continue;
    const sameSubject = Boolean(f.subjects?.includes(subject));

    const ownPeriods = await Timetable.countFacultyDay(day, f.id);
    const proxyPeriods = proxiesToday.filter((p) => p.assigned_to === f.id).length;
    const load = ownPeriods + proxyPeriods;
    if (load >= MAX_PERIODS_PER_DAY) continue;

    const factors = [`free in period ${period}`];
    let score = 50;
    factors.push(sameSubject ? `teaches ${subject}` : `backup — teaches ${(f.subjects || []).join(', ')}`);
    if (teachesClass.has(f.id)) {
      score += 20;
      factors.push(`knows ${className}`);
    }
    const taken = monthCount[f.id] || 0;
    score += 10 - 4 * taken;
    factors.push(taken === 0 ? 'no proxies this month' : `${taken} ${taken === 1 ? 'proxy' : 'proxies'} this month`);
    score -= 5 * load;
    factors.push(`${load} ${load === 1 ? 'class' : 'classes'} that day`);

    ranked.push({ faculty: f.id, name: f.name, score, factors, sameSubject });
  }

  // same-subject teachers first, then everyone else; best score first within each group
  ranked.sort((a, b) => Number(b.sameSubject) - Number(a.sameSubject) || b.score - a.score);
  return ranked;
}

/** Move a proxy request to the next person in its list (after a decline or no reply). */
export function advance(proxy, action) {
  const at = new Date().toISOString();
  if (proxy.offered_to) proxy.history.push({ faculty: proxy.offered_to, action, at });
  proxy.current_index += 1;
  const next = proxy.candidates[proxy.current_index];
  if (next) {
    proxy.offered_to = next.faculty;
    // tell the next teacher why it reached them
    const why = (next.factors || []).filter((f) => !f.startsWith('backup')).join(', ');
    proxy.ai_reason =
      next.sameSubject === false
        ? `No ${proxy.subject} teacher could take it, so it came to you as backup. ${why}`.trim()
        : why || proxy.ai_reason;
    proxy.history.push({ faculty: next.faculty, action: 'offered', at });
  } else {
    proxy.offered_to = null;
    proxy.status = 'uncovered';
  }
  return proxy;
}
