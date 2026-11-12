import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorText } from '../api';
import { Button, Card, Empty, ErrorBox, StatusBadge } from '../components/ui.jsx';
import { leaveTypeLabel } from '../leaveType.js';
import { useLive, useNow, countdown } from '../live.js';
import Insights from '../components/Insights.jsx';
import CampusLive from '../components/campus/CampusLive.jsx';

function Stat({ label, value, tone }) {
  const tones = {
    slate: 'text-ink',
    green: 'text-sage',
    amber: 'text-brass-2',
    red: 'text-clay',
  };
  return (
    <div className="rounded-lg border border-line bg-white/90 p-4 backdrop-blur-sm">
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 font-display text-4xl font-medium tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function LeaveRequest({ l, onDone, onError, onNotice }) {
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const decide = async (action) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/hod/leaves/${l._id}/decide`, { action, note });
      if (data.note && action === 'approve') onNotice(data.note);
      onDone();
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-md border p-4 ${l.urgent ? 'border-clay/50 bg-clay-soft/40' : 'border-line bg-paper/70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg font-medium text-ink">{l.facultyName}</div>
          <div className="font-mono text-xs text-muted">{l.prettyDate} · {l.reason}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-block rounded bg-ink px-2 py-0.5 text-xs font-semibold text-paper">
              {l.days > 1 ? `${l.days} days · full day` : leaveTypeLabel(l.leaveType, l.periods)}
            </span>
            {l.balance && (
              <span className="font-mono text-[11px] text-muted">{l.balance.left} of {l.balance.total} leaves left this year</span>
            )}
            {l.source === 'erp' && (
              <span className="rounded border border-sage/40 bg-sage-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sage" title={l.erpRef ? `ERP reference ${l.erpRef}` : undefined}>
                From school ERP{l.erpRef ? ` · ${l.erpRef}` : ''}
              </span>
            )}
          </div>
        </div>
        {l.urgent ? (
          <span className="rounded bg-clay px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-paper">Urgent · today</span>
        ) : (
          <span className="rounded bg-brass-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-brass-2">New</span>
        )}
      </div>
      <p className="mt-2 text-sm italic text-ink/70">“{l.rawText}”</p>
      {l.classes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {l.classes.map((c) => (
            <span key={c.key} className="rounded border border-line bg-white px-2 py-0.5 font-mono text-[11px] text-ink/80">
              {l.days > 1 ? `${c.day} ` : ''}P{c.period} · {c.className} · {c.subject}
            </span>
          ))}
        </div>
      )}

      {declining ? (
        <div className="mt-3 space-y-2">
          <textarea
            rows={2}
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why are you declining? e.g. Internal exams that week — please reschedule."
            className="w-full rounded-md border border-line bg-white p-2.5 text-sm outline-none focus:border-brass"
          />
          <div className="flex gap-2">
            <Button variant="ghost" className="!border-clay !text-clay" disabled={busy || note.trim().length < 3} onClick={() => decide('decline')}>
              {busy ? 'Saving…' : 'Decline with reason'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setDeclining(false); setNote(''); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button variant="success" disabled={busy} onClick={() => decide('approve')}>{busy ? 'Approving…' : 'Approve'}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setDeclining(true)}>Decline</Button>
        </div>
      )}
    </div>
  );
}

function LoadChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const avg = data.reduce((s, d) => s + d.count, 0) / (data.length || 1);
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const heavy = d.count > avg * 1.5 && d.count >= 3;
        return (
          <div key={d.name} className="grid grid-cols-[9.5rem_1fr_2rem] items-center gap-2 text-sm">
            <span className="truncate text-ink/80">{d.name}</span>
            <div className="h-5 rounded bg-paper">
              <div className={`h-5 rounded ${heavy ? 'bg-clay' : 'bg-ink-3'}`} style={{ width: `${(d.count / max) * 100}%` }} />
            </div>
            <span className={`text-right font-semibold ${heavy ? 'text-clay' : 'text-ink/80'}`}>{d.count}</span>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted">Red = overloaded (well above the department average of {avg.toFixed(1)}).</p>
    </div>
  );
}

/** the school ERP at a glance, on the HOD's dashboard */
function ErpCard() {
  const [c, setC] = useState(null);
  useEffect(() => {
    let on = true;
    const get = () => api.get('/erp').then((r) => on && setC(r.data.connection)).catch(() => {});
    get();
    const t = setInterval(get, 30000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, []);
  if (!c) return null;
  return (
    <Card
      title="School ERP"
      subtitle={c.connected ? `Linked to ${c.erpName || 'your school ERP'}` : 'Link the software your school already uses'}
      right={<span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${c.connected ? 'bg-sage shadow-[0_0_10px_2px_rgba(98,211,155,0.5)]' : 'bg-muted'}`} />}
    >
      <p className="mb-3 text-sm text-ink/80">
        {c.connected
          ? 'Leaves come in from it by itself, and it always shows who is covering.'
          : 'Leaves come in by themselves, and its timetable shows who is covering.'}
      </p>
      <Link to="/hod/erp" className="inline-block rounded-[11px] border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-brass/60">
        {c.connected ? 'Open School ERP' : 'See how it works'}
      </Link>
    </Card>
  );
}

export default function Hod() {
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summaryBusy, setSummaryBusy] = useState(false);

  const [insights, setInsights] = useState(null);
  const [today, setToday] = useState(null);
  const load = useCallback(async () => {
    try {
      const [o, t] = await Promise.all([api.get('/hod/overview'), api.get('/hod/today')]);
      setData(o.data);
      setToday(t.data);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);
  const loadInsights = useCallback(() => api.get('/hod/insights').then((r) => setInsights(r.data)).catch(() => {}), []);

  useEffect(() => {
    load();
    loadInsights();
    const t = setInterval(load, 20000); // backup; live events refresh at once
    return () => clearInterval(t);
  }, [load, loadInsights]);
  useLive((ev) => {
    load();
    if (ev.action === 'accepted' || ev.action === 'declined' || ev.action === 'passed') loadInsights();
  });
  const now = useNow(1000);

  const getSummary = async () => {
    setSummaryBusy(true);
    try {
      const { data } = await api.get('/hod/summary');
      setSummary(data.summary);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSummaryBusy(false);
    }
  };

  const skip = async (id) => {
    try {
      const { data } = await api.post(`/hod/proxies/${id}/skip`);
      if (data.leaveDeclined) setNotice(data.note);
    } catch (err) {
      setError(errorText(err));
    }
    load();
  };

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reportBusy, setReportBusy] = useState(false);
  const downloadReport = async () => {
    setReportBusy(true);
    try {
      const res = await api.get('/hod/report', { params: { month }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proxypilot-report-${month}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setReportBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset all demo data?')) return;
    await api.post('/hod/reset-demo');
    localStorage.clear();
    window.location.href = '/';
  };

  if (!data) return <p className="text-muted">{error || 'Loading…'}</p>;
  const { stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight text-ink">Department overview</h1>
          <p className="text-sm text-muted">CSE · today and upcoming · updates the moment anything changes</p>
        </div>
        <Button variant="ghost" onClick={reset}>Reset demo data</Button>
      </div>
      <ErrorBox text={error} />
      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-clay/30 bg-clay-soft px-3 py-2 text-sm text-clay">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="font-semibold">×</button>
        </div>
      )}

      {data.leaveRequests.length > 0 && (
        <section className="rounded-lg border-2 border-brass bg-white/95 p-5 shadow-[0_12px_32px_-18px_rgba(168,122,42,0.6)]">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brass font-mono text-sm font-semibold text-paper">{data.leaveRequests.length}</span>
            <div>
              <h2 className="font-display text-xl font-medium text-ink">Leave requests</h2>
              <p className="text-sm text-muted">Approve to arrange substitutes automatically — same-subject teachers first, others as backup. Declining needs a reason, which the teacher will see.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.leaveRequests.map((l) => (
              <LeaveRequest key={l._id} l={l} onDone={load} onError={setError} onNotice={setNotice} />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Teachers on leave" value={stats.teachersOnLeave} tone="slate" />
        <Stat label="Classes to cover" value={stats.total} tone="slate" />
        <Stat label="Covered" value={stats.covered} tone="green" />
        <Stat label="Waiting for reply" value={stats.pending} tone="amber" />
        <Stat label="Not covered" value={stats.uncovered} tone="red" />
      </div>

      <CampusLive data={today} />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Proxy lectures" subtitle="Every class that needs a substitute">
          {data.proxies.length === 0 ? (
            <Empty>No leaves today or upcoming. Log in as a faculty member and apply for leave.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-muted">
                    <th className="py-2 pr-2">When</th>
                    <th className="py-2 pr-2">Class</th>
                    <th className="py-2 pr-2">Absent</th>
                    <th className="py-2 pr-2">Substitute</th>
                    <th className="py-2 pr-2">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {data.proxies.map((p) => (
                    <tr key={p._id} className="align-top">
                      <td className="py-2 pr-2">
                        <div className="font-medium text-ink">{p.prettyDate}</div>
                        <div className="text-xs text-muted">P{p.period} · {p.time}</div>
                      </td>
                      <td className="py-2 pr-2">{p.className}<div className="text-xs text-muted">{p.subject}</div></td>
                      <td className="py-2 pr-2">{p.absentFaculty?.name}</td>
                      <td className="py-2 pr-2">
                        {p.assignedTo?.name || p.offeredTo?.name || '—'}
                        {p.history.some((h) => h.action === 'declined' || h.action === 'no-reply') && (
                          <div className="text-xs text-muted">
                            {p.history.filter((h) => h.action === 'declined' || h.action === 'no-reply').length} passed on
                            {p.history.some((h) => h.auto) ? ' · no reply' : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <StatusBadge status={p.status} />
                        {p.status === 'pending' && p.replyBy && <div className="mt-1 whitespace-nowrap font-mono text-[10px] text-muted">passes on {countdown(p.replyBy, now)}</div>}
                      </td>
                      <td className="py-2 text-right">
                        {p.status === 'pending' && (
                          <button onClick={() => skip(p._id)} className="whitespace-nowrap text-xs font-semibold text-brass-2 hover:underline">
                            No reply → next
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <ErpCard />
          <Card title="Monthly report" subtitle="Leaves, substitutes and cover status — opens in Excel">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-md border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brass"
              />
              <Button variant="ghost" disabled={reportBusy || !month} onClick={downloadReport}>
                {reportBusy ? 'Preparing…' : 'Download report'}
              </Button>
            </div>
          </Card>
          <Card title="Weekly note">
            {summary ? <p className="text-sm text-ink/80">{summary}</p> : <p className="text-sm text-muted">Get a quick summary of coverage and fairness.</p>}
            <Button className="mt-3" variant="ghost" disabled={summaryBusy} onClick={getSummary}>
              {summaryBusy ? 'Preparing…' : summary ? 'Refresh note' : 'Prepare note'}
            </Button>
          </Card>
          <Card title="Proxy load this month" subtitle="Used to keep the ranking fair">
            <LoadChart data={data.loadThisMonth} />
          </Card>
        </div>
      </div>

      <Insights data={insights} />
    </div>
  );
}
