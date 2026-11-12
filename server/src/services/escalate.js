import { Proxies } from '../db.js';
import { advance } from './matching.js';
import { declineForNoCover } from './cover.js';
import { publish } from './live.js';
import { todayIST, PERIOD_TIMES } from './dates.js';
import { emitCover } from './erp.js';

/*
  Nobody waits on a silent phone.
  A cover request that gets no answer within the reply window passes to the next
  best teacher by itself. If the class starts soon, the window is shorter.
  The sweep runs every minute on the server, and also whenever someone opens the
  app (so it still works on hosts that sleep between requests).
*/

export const replyMinutes = () => Math.max(1, Number(process.env.REPLY_MINUTES) || 15);

/** minutes after midnight (India time) when a period starts */
function periodStart(period) {
  const t = PERIOD_TIMES[period];
  if (!t) return null;
  const [h, m] = t.split('–')[0].split(':').map(Number);
  return (h < 8 ? h + 12 : h) * 60 + m; // 1:30 means 13:30
}

function nowISTMinutes() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [h, m] = parts.split(':').map(Number);
  return h * 60 + m;
}

/** When the current teacher's time to reply runs out (a Date), or null */
export function replyBy(p) {
  const history = p.history || [];
  const offered = [...history].reverse().find((h) => h.action === 'offered');
  if (!offered || p.status !== 'pending') return null;
  let minutes = replyMinutes();
  // the class is today and starts within the hour: give each teacher less time
  if (p.date === todayIST()) {
    const start = periodStart(p.period);
    if (start != null && start - nowISTMinutes() < 60) minutes = Math.min(minutes, 5);
  }
  return new Date(new Date(offered.at).getTime() + minutes * 60_000);
}

let last = 0;
let running = null;

export function sweepTimeouts({ force = false } = {}) {
  if (running) return running;
  if (!force && Date.now() - last < 30_000) return Promise.resolve(0);
  last = Date.now();
  running = (async () => {
    let moved = 0;
    const pending = await Proxies.where(`status = 'pending' AND leave_id IS NOT NULL AND date >= $1`, [todayIST()]);
    for (const p of pending) {
      const by = replyBy(p);
      if (!by || by > new Date()) continue;
      const from = p.offered_to;
      advance(p, 'no-reply');
      p.history[p.history.length - (p.status === 'uncovered' ? 1 : 2)].auto = true;
      await Proxies.save(p);
      moved++;
      if (p.status === 'uncovered') {
        await declineForNoCover(p.leave_id, p, 'declined');
        publish(['hod', p.absent_faculty_id, from], { type: 'leave', action: 'declined', why: 'no-cover' });
      } else {
        emitCover('cover.passed', p);
        publish([from], { type: 'proxy', action: 'expired', className: p.class_name, period: p.period });
        publish([p.offered_to], { type: 'proxy', action: 'offered', className: p.class_name, period: p.period });
        publish(['hod'], { type: 'proxy', action: 'passed', className: p.class_name, period: p.period });
      }
    }
    return moved;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Express middleware: run a (throttled) sweep before answering */
export const withSweep = (req, res, next) => {
  sweepTimeouts()
    .catch((e) => console.error('[escalate]', e.message))
    .finally(() => next());
};

export function startEscalationTimer() {
  const t = setInterval(() => sweepTimeouts({ force: true }).catch((e) => console.error('[escalate]', e.message)), 60_000);
  t.unref?.();
  return t;
}
