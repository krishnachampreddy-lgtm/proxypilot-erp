import { useCallback, useEffect, useState } from 'react';
import api, { errorText } from '../api';
import { Button, Card, Empty, ErrorBox, StatusBadge } from '../components/ui.jsx';
import LeaveCalendar, { dayKey } from '../components/LeaveCalendar.jsx';
import { leaveTypeLabel } from '../leaveType.js';
import { useLive, useNow, countdown } from '../live.js';

const EXAMPLES = [
  'Down with fever, cannot come tomorrow. Please arrange proxies for my classes.',
  'Have a family function tomorrow, can’t take my 2nd and 4th period.',
  'Attending a workshop today, please cover my classes after lunch (period 5-6).',
];

const LEAVE_STATUS = {
  pending: ['Awaiting HOD', 'bg-brass-soft text-brass-2'],
  approved: ['Approved', 'bg-sage-soft text-sage'],
  declined: ['Declined', 'bg-clay-soft text-clay'],
};
function LeaveStatus({ status }) {
  const [label, cls] = LEAVE_STATUS[status] || LEAVE_STATUS.approved;
  return <span className={`rounded px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${cls}`}>{label}</span>;
}

export default function Faculty() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [requests, setRequests] = useState({ waiting: [], accepted: [] });
  const [schedule, setSchedule] = useState(null);
  const [date, setDate] = useState(null);
  const [endDate, setEndDate] = useState(null); // set only for a leave of several days
  const [multi, setMulti] = useState(false);
  const [skip, setSkip] = useState([]); // periods the teacher un-ticked
  const [session, setSession] = useState('full'); // full | morning | afternoon | periods
  const [summary, setSummary] = useState(null);
  const [sickBusy, setSickBusy] = useState(false);
  const [sickError, setSickError] = useState('');
  const [sickDone, setSickDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, r, s, m] = await Promise.all([api.get('/leaves/mine'), api.get('/proxies/mine'), api.get('/leaves/schedule'), api.get('/leaves/summary')]);
      setLeaves(l.data.leaves);
      setRequests(r.data);
      setSchedule(s.data);
      setSummary(m.data);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // backup; live events refresh at once
    return () => clearInterval(t);
  }, [load]);
  useLive(() => load());
  const now = useNow(1000);

  const [calBusy, setCalBusy] = useState(false);
  const addToCalendar = async () => {
    setCalBusy(true);
    try {
      const res = await api.get('/proxies/calendar.ics', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'proxypilot-cover.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setCalBusy(false);
    }
  };

  const submitLeave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const body = { text };
      if (date && multi) {
        if (!endDate) throw { response: { data: { error: 'Tap the last day of your leave on the calendar.' } } };
        body.date = date;
        body.endDate = endDate;
      } else if (date) {
        body.date = date;
        body.session = session;
        const chosen = sessionClasses.map((c) => c.period).filter((p) => session !== 'periods' || !skip.includes(p));
        if (!chosen.length) throw { response: { data: { error: 'Select at least one class to cover.' } } };
        if (session === 'periods') body.periods = chosen;
      }
      const { data } = await api.post('/leaves', body);
      setResult(data);
      setText('');
      setDate(null);
      setEndDate(null);
      setMulti(false);
      setSkip([]);
      setSession('full');
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const dayClasses = date && schedule ? schedule.classes.filter((c) => c.day === dayKey(date)).sort((a, b) => a.period - b.period) : [];
  const sessionClasses = dayClasses.filter((c) => (session === 'morning' ? c.period <= 4 : session === 'afternoon' ? c.period >= 5 : true));
  const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const rangeDays = [];
  if (multi && date && endDate) {
    for (let t = Date.parse(`${date}T00:00:00Z`); t <= Date.parse(`${endDate}T00:00:00Z`); t += 864e5) {
      const d = new Date(t).toISOString().slice(0, 10);
      const n = schedule ? schedule.classes.filter((c) => c.day === dayKey(d)).length : 0;
      if (dayKey(d) !== 'Sun' && n) rangeDays.push({ d, n });
    }
  }
  const pickDate = (d) => {
    setError('');
    setSkip([]);
    if (multi && date && !endDate && d > date) return setEndDate(d);
    if (d === date && !endDate) return setDate(null);
    setDate(d);
    setEndDate(null);
  };
  const pretty = date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '';

  // One tap: full-day leave for today, flagged urgent for the HOD
  const sickToday = async () => {
    if (!window.confirm('Apply full-day leave for today? The HOD will see it as urgent.')) return;
    setSickBusy(true);
    setSickError('');
    setResult(null);
    try {
      await api.post('/leaves', { urgent: true, session: 'full', text: 'Unwell today, cannot come to college' });
      setSickDone(true);
      load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSickError(errorText(err));
    } finally {
      setSickBusy(false);
    }
  };

  const today = schedule?.today;
  const appliedToday = today && schedule.leaveDates.includes(today);

  const cancelLeave = async (id) => {
    if (!window.confirm('Cancel this leave request?')) return;
    try {
      await api.post(`/leaves/${id}/cancel`);
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const balance = schedule?.balance;

  const respond = async (id, action) => {
    try {
      await api.post(`/proxies/${id}/respond`, { action });
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="space-y-6">
      {schedule && !appliedToday && (
        <div className="flex flex-col gap-3 rounded-lg border border-clay/30 bg-white/90 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-display text-lg font-medium text-ink">Not well today?</div>
            <p className="text-sm text-muted">One tap applies a full-day leave for today and alerts the HOD right away.</p>
          </div>
          <button
            onClick={sickToday}
            disabled={sickBusy}
            className="shrink-0 rounded-md bg-clay px-5 py-3 text-sm font-semibold text-paper shadow-sm transition hover:brightness-110 disabled:opacity-60"
          >
            {sickBusy ? 'Sending…' : 'I’m sick today'}
          </button>
        </div>
      )}
      <ErrorBox text={sickError} />
      {sickDone && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-sage/40 bg-sage-soft px-4 py-3 text-sm text-sage">
          <span><b>Get well soon.</b> Today’s leave was sent to the HOD as urgent. You’ll see the decision under “My leaves” and in the bell.</span>
          <button onClick={() => setSickDone(false)} className="font-semibold">×</button>
        </div>
      )}

      {requests.waiting.length > 0 && (
        <section className="rounded-lg border-2 border-brass bg-white/95 p-5 shadow-[0_12px_32px_-18px_rgba(168,122,42,0.6)]">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brass font-mono text-sm font-semibold text-paper">{requests.waiting.length}</span>
            <div>
              <h2 className="font-display text-xl font-medium text-ink">
                {requests.waiting.length === 1 ? 'A colleague needs your help' : 'Colleagues need your help'}
              </h2>
              <p className="text-sm text-muted">Accept to take the class, or decline and it passes to the next teacher. No reply in {requests.replyMinutes || 15} minutes passes it on automatically.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {requests.waiting.map((p) => (
              <div key={p._id} className="rounded-md border border-line bg-paper/70 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-lg font-medium text-ink">{p.className} · {p.subject}</div>
                    <div className="font-mono text-xs text-muted">{p.prettyDate} · P{p.period} · {p.time}</div>
                  </div>
                  <span className="rounded bg-brass-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-brass-2">
                    {p.replyBy ? `Passes on ${countdown(p.replyBy, now)}` : 'Waiting'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink/80">Covering for <b>{p.absentFaculty?.name}</b></p>
                {p.aiReason && <p className="mt-1 text-xs text-brass-2">Why you: {p.aiReason}</p>}
                {p.handoverNote && (
                  <div className="mt-2 whitespace-pre-line rounded border border-line bg-white p-2 text-xs text-ink/80">
                    <b>Handover note</b>
                    {'\n'}
                    {p.handoverNote}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <Button variant="success" onClick={() => respond(p._id, 'accept')}>Accept</Button>
                  <Button variant="ghost" onClick={() => respond(p._id, 'decline')}>Decline</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <Card title="Apply for leave" subtitle="Pick a date on the calendar, or just write it like a WhatsApp message.">
          <form onSubmit={submitLeave} className="space-y-4">
            {balance && (
              <div className="flex items-center gap-3 rounded-md border border-line bg-paper/60 px-3 py-2">
                <div className="font-display text-2xl font-medium tabular-nums text-ink">
                  {balance.left}<span className="text-base text-muted"> / {balance.total}</span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-ink">Leaves left this year</div>
                  <div className="mt-1 h-1.5 rounded bg-line">
                    <div className={`h-1.5 rounded ${balance.left <= 2 ? 'bg-clay' : 'bg-sage'}`} style={{ width: `${(balance.left / balance.total) * 100}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted">Full day counts 1 · a session or a few periods count ½</div>
                </div>
              </div>
            )}
            {schedule && (
              <LeaveCalendar
                today={schedule.today}
                classes={schedule.classes}
                leaveDates={schedule.leaveDates}
                value={date}
                endValue={multi ? endDate : null}
                onChange={pickDate}
              />
            )}

            {date && (
              <div className="rounded-md border border-line bg-paper/60 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">{multi && endDate ? `${fmt(date)} – ${fmt(endDate)}` : pretty}</p>
                  <button type="button" onClick={() => { setDate(null); setEndDate(null); }} className="text-xs text-brass-2 hover:underline">Clear date</button>
                </div>
                <div className="mt-2 inline-flex rounded-md border border-line bg-white p-0.5 text-xs font-semibold">
                  {[[false, 'One day'], [true, 'Several days']].map(([v, label]) => (
                    <button
                      type="button"
                      key={label}
                      onClick={() => { setMulti(v); setEndDate(null); setSession('full'); }}
                      className={`rounded px-3 py-1 transition ${multi === v ? 'bg-ink text-paper' : 'text-ink/70 hover:text-ink'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {multi ? (
                  !endDate ? (
                    <p className="mt-2 text-sm text-ink/80">Now tap the <b>last day</b> of your leave on the calendar.</p>
                  ) : rangeDays.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">You have no classes on these days, so nothing needs covering.</p>
                  ) : (
                    <div className="mt-2">
                      <p className="text-sm text-ink/80">
                        <b>{rangeDays.length} {rangeDays.length === 1 ? 'day' : 'days'}</b> · full day · uses {rangeDays.length} of your {balance?.left ?? '—'} leaves left
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {rangeDays.map(({ d, n }) => (
                          <span key={d} className="rounded border border-ink bg-ink px-2 py-1 font-mono text-[11px] text-paper">{fmt(d)} · {n} {n === 1 ? 'class' : 'classes'}</span>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted">Sundays and days without classes are skipped.</p>
                    </div>
                  )
                ) : dayClasses.length === 0 ? (
                  <p className="mt-1 text-sm text-muted">You have no classes this day, so nothing needs covering.</p>
                ) : (
                  <>
                    <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-muted">Leave for</p>
                    <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ['full', 'Full day', 'All classes'],
                        ['morning', 'Morning', 'P1 – P4'],
                        ['afternoon', 'Afternoon', 'P5 – P6'],
                        ['periods', 'Choose periods', 'Pick below'],
                      ].map(([key, label, hint]) => (
                        <button
                          type="button"
                          key={key}
                          onClick={() => { setSession(key); setSkip([]); }}
                          className={`rounded-md border px-3 py-2 text-left transition ${session === key ? 'border-brass bg-brass-soft text-ink' : 'border-line bg-white text-ink/80 hover:border-ink/40'}`}
                        >
                          <span className="block text-sm font-semibold">{label}</span>
                          <span className="block font-mono text-[10px] uppercase tracking-wide text-muted">{hint}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      {sessionClasses.length === 0
                        ? 'You have no classes in this session, so nothing needs covering.'
                        : session === 'periods'
                          ? 'Classes to cover (tap to leave one out):'
                          : 'These classes will need cover:'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sessionClasses.map((c) => {
                        const on = session !== 'periods' || !skip.includes(c.period);
                        return (
                          <button
                            type="button"
                            key={c.period}
                            disabled={session !== 'periods'}
                            onClick={() => setSkip((s) => (on ? [...s, c.period] : s.filter((p) => p !== c.period)))}
                            className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition ${on ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-muted line-through'}`}
                          >
                            <span className="font-mono">P{c.period} · {c.time}</span>
                            <span className="block font-medium">{c.className} · {c.subject}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-muted">
                {date ? 'Reason (optional)' : 'Or describe your leave'}
              </label>
              <textarea
                rows={date ? 2 : 3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={date ? 'e.g. Family function' : "e.g. Down with fever, can't come tomorrow…"}
                className="w-full rounded-md border border-line p-3 text-sm outline-none focus:border-brass"
              />
              {!date && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {EXAMPLES.map((ex) => (
                    <button type="button" key={ex} onClick={() => setText(ex)} className="rounded-full bg-paper px-3 py-1 text-left text-xs text-ink/80 hover:bg-paper-2">
                      {ex.length > 45 ? ex.slice(0, 45) + '…' : ex}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ErrorBox text={error} />
            <Button type="submit" disabled={busy || (date ? (multi ? rangeDays.length === 0 : sessionClasses.length === 0) : text.trim().length < 5)}>
              {busy ? 'Sending…' : date ? (multi ? `Apply leave for ${rangeDays.length || ''} days` : 'Apply leave for this date') : 'Submit leave'}
            </Button>
          </form>

          {result && (
            <div className="mt-5 rounded-md border border-brass bg-brass-soft/60 p-4">
              <p className="font-display text-lg font-medium text-ink">Sent to the HOD for approval</p>
              <p className="mt-1 text-sm text-ink/80">
                <b>{result.understood.prettyDate}</b> · {result.understood.days > 1 ? `${result.understood.days} days` : leaveTypeLabel(result.understood.leaveType, result.understood.periods)} · {result.understood.reason}
              </p>
              <p className="mt-2 text-xs text-muted">Once the HOD approves, substitutes are arranged for your classes. You can follow it under “My leaves”.</p>
            </div>
          )}
        </Card>

        <Card title="My leaves" subtitle="Live status of every class you are missing">
          {leaves.length === 0 ? (
            <Empty>No leaves yet.</Empty>
          ) : (
            <div className="space-y-4">
              {leaves.map((l) => (
                <div key={l._id} className="rounded-md border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{l.prettyDate}</span>
                    <span className="flex items-center gap-1.5">
                      {l.urgent && <span className="rounded bg-clay px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-paper">Urgent</span>}
                      <LeaveStatus status={l.status} />
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink/80">
                    {leaveTypeLabel(l.leaveType, l.periods)}
                    {l.groupDays > 1 && <span className="ml-2 rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted">part of {l.groupDays}-day leave</span>}
                  </p>
                  <p className="mt-0.5 text-xs italic text-muted">“{l.rawText}” · {l.reason}</p>
                  {l.status === 'pending' && (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-sm text-ink/80">Waiting for the HOD to approve.</p>
                      <button type="button" onClick={() => cancelLeave(l._id)} className="text-xs font-semibold text-clay hover:underline">{l.groupDays > 1 ? `Cancel all ${l.groupDays} days` : 'Cancel request'}</button>
                    </div>
                  )}
                  {l.status === 'declined' && (
                    <div className="mt-2 rounded border border-clay/30 bg-clay-soft px-3 py-2 text-sm text-clay">
                      <b>{l.hodNote?.startsWith('Declined automatically') ? 'Reason:' : 'HOD’s reason:'}</b> {l.hodNote?.replace('Declined automatically: ', '')}
                    </div>
                  )}
                  <ul className="mt-2 divide-y divide-line/70">
                    {l.proxies.map((p) => (
                      <li key={p._id} className="flex items-center justify-between py-1.5 text-sm">
                        <span>P{p.period} · {p.className} · {p.subject}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-ink/80">{p.assignedTo?.name || p.offeredTo?.name || '—'}</span>
                          <StatusBadge status={p.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-6 lg:col-span-2">
        {summary && (
          <Card title={`My ${summary.year} at a glance`}>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Leaves left', `${summary.balance.left}`, `of ${summary.balance.total}`, 'text-ink'],
                ['Leaves taken', `${summary.leavesTaken}`, summary.leavesPending ? `+${summary.leavesPending} waiting` : 'approved', 'text-ink'],
                ['Proxies I took', `${summary.proxiesThisYear}`, `${summary.proxiesThisMonth} this month`, 'text-sage'],
                ['Classes covered for me', `${summary.coveredForMe}`, 'by colleagues', 'text-brass-2'],
              ].map(([label, value, sub, tone]) => (
                <div key={label} className="rounded-md border border-line bg-paper/50 p-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</div>
                  <div className={`mt-0.5 font-display text-3xl font-medium tabular-nums ${tone}`}>{value}</div>
                  <div className="text-xs text-muted">{sub}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {requests.waiting.length === 0 && (
          <Card title="Proxy requests for you" subtitle="When a colleague is on leave and you are the best fit, the request shows up here.">
            <Empty>No requests right now.</Empty>
          </Card>
        )}

        <Card title="My upcoming proxies" subtitle={requests.accepted.length ? 'Add them to your phone calendar with a 10-minute reminder.' : undefined}>
          {requests.accepted.length === 0 ? (
            <Empty>None.</Empty>
          ) : (
            <>
              <ul className="space-y-2">
                {requests.accepted.map((p) => (
                  <li key={p._id} className="rounded-lg bg-sage-soft px-3 py-2 text-sm text-sage">
                    <b>{p.prettyDate}</b> · P{p.period} ({p.time}) · {p.className} {p.subject}
                  </li>
                ))}
              </ul>
              <Button className="mt-3" variant="ghost" disabled={calBusy} onClick={addToCalendar}>
                {calBusy ? 'Preparing…' : 'Add to calendar (.ics)'}
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
    </div>
  );
}
