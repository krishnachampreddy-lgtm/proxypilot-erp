import { Leaves } from '../db.js';
import { arrangeCover } from './cover.js';
import { prettyDate } from './dates.js';
import { publish } from './live.js';
import { emitLeave } from './erp.js';

/**
 * Approve or decline one leave request (every pending day of it).
 * Used by the HOD's Approve / Decline buttons, and for leaves the school ERP has already approved.
 * Returns { status, proxies, note }.
 */
export async function decideLeave(leave, action, note = '') {
  const days = (await Leaves.sameGroup(leave)).filter((l) => l.status === 'pending');

  if (action === 'decline') {
    const decided = [];
    for (const d of days) decided.push(await Leaves.decide(d.id, 'declined', note));
    publish([leave.faculty_id], { type: 'leave', action: 'declined' });
    emitLeave('leave.declined', decided, note);
    return { status: 'declined' };
  }

  // approve every day, then arrange cover day by day
  let proxies = 0;
  const notes = [];
  const offered = new Set();
  const approvedDays = [];
  for (const d of days) {
    const approved = await Leaves.decide(d.id, 'approved', note || null);
    const made = await arrangeCover(approved);
    proxies += made.length;
    for (const p of made) if (p.offered_to) offered.add(p.offered_to);
    const after = await Leaves.byId(d.id);
    // a day nobody can cover is declined inside arrangeCover (and the ERP is told there)
    if (after.status === 'declined') notes.push(days.length > 1 ? `${prettyDate(d.date)}: ${after.hod_note}` : after.hod_note);
    else approvedDays.push(after);
  }
  publish([leave.faculty_id], { type: 'leave', action: notes.length === days.length ? 'declined' : 'approved' });
  publish([...offered], { type: 'proxy', action: 'offered' });
  publish(['student'], { type: 'timetable' });
  publish(['hod'], { type: 'leave', action: 'decided' });
  if (approvedDays.length) emitLeave('leave.approved', approvedDays, note || null);

  if (notes.length === days.length) return { status: 'declined', note: notes.join(' ') };
  if (notes.length) return { status: 'approved', proxies, note: `Approved, except — ${notes.join(' ')}` };
  return { status: 'approved', proxies };
}
