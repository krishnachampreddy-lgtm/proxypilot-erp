import { Proxies, Timetable, Users, Leaves, q } from '../db.js';
import { rankCandidates } from './matching.js';
import { explainAndHandover, templateNote } from './ai.js';
import { weekday, PERIOD_TIMES } from './dates.js';
import { emitCover, emitLeave } from './erp.js';

/**
 * Runs after the HOD approves a leave:
 * for every class the teacher misses -> rank free substitutes -> reason + handover note -> request goes to the best fit.
 */
export async function arrangeCover(leave) {
  const day = weekday(leave.date);
  const absent = await Users.byId(leave.faculty_id);
  const classes = (await Timetable.byFaculty(leave.faculty_id)).filter((c) => c.day === day && leave.periods.includes(c.period));

  const proxies = [];
  const noteInput = [];
  for (const c of classes) {
    const ranked = await rankCandidates({
      date: leave.date,
      day,
      period: c.period,
      className: c.class_name,
      subject: c.subject,
      absentFacultyId: leave.faculty_id,
    });
    const top = ranked[0];
    const proxy = await Proxies.create({
      leaveId: leave.id,
      date: leave.date,
      day,
      period: c.period,
      className: c.class_name,
      subject: c.subject,
      currentTopic: c.current_topic,
      absentFacultyId: leave.faculty_id,
      candidates: ranked.map(({ faculty, score, factors, sameSubject }) => ({ faculty, score, factors, sameSubject })),
      offeredTo: top?.faculty,
      status: top ? 'pending' : 'uncovered',
      history: top ? [{ faculty: top.faculty, action: 'offered', at: new Date().toISOString() }] : [],
    });
    proxies.push(proxy);
    noteInput.push({
      id: String(proxy.id),
      className: c.class_name,
      subject: c.subject,
      period: c.period,
      topic: c.current_topic,
      absentName: absent?.name,
      top: top ? { name: top.name, factors: top.factors } : null,
    });
  }

  // a class nobody at all is free to take -> this day's leave is declined
  const stuck = proxies.find((p) => p.status === 'uncovered');
  if (stuck) {
    await declineForNoCover(leave.id, stuck, 'free');
    return [];
  }

  const notes = await explainAndHandover(noteInput);
  for (const [i, proxy] of proxies.entries()) {
    const note = notes[String(proxy.id)] || templateNote(noteInput[i]);
    proxy.ai_reason = note.reason;
    proxy.handover_note = note.handover;
    await Proxies.save(proxy);
  }
  return proxies;
}

/**
 * Nobody could take a class (no teacher free, or every teacher declined — same subject first, then others):
 * decline that day's leave with a clear reason and cancel any cover already arranged for it.
 */
export async function declineForNoCover(leaveId, proxy, why = 'declined') {
  const leave = await Leaves.byId(leaveId);
  if (!leave || leave.status === 'declined') return;
  const where = `P${proxy.period} (${PERIOD_TIMES[proxy.period]}) · ${proxy.class_name}`;
  const note =
    why === 'free'
      ? `Declined automatically: no teacher is free to take ${where}.`
      : `Declined automatically: no teacher (${proxy.subject} or any other subject) could take ${where}.`;
  const declined = await Leaves.decide(leaveId, 'declined', note);
  // tell the school ERP before the cover rows are removed
  if (proxy?.id) await emitCover('cover.failed', { ...proxy, status: 'uncovered' }).catch(() => {});
  await emitLeave('leave.declined', [declined], note).catch(() => {});
  await q('DELETE FROM proxies WHERE leave_id = $1', [leaveId]);
  return note;
}
