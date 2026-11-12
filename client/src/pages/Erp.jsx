import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorText } from '../api';
import { Button, Card, ErrorBox } from '../components/ui.jsx';
import { useLive } from '../live.js';

// Where the ERP's developers find the full API guide
const GUIDE_URL = 'https://github.com/krishnachampreddy-lgtm/proxypilot-erp/blob/main/docs/ERP-API.md';

const n = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

const ago = (t) => {
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(t)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const btnLink =
  'inline-flex items-center justify-center gap-1.5 rounded-[11px] px-4 py-2 text-sm font-semibold transition';

/* ------------------------------------------------------------------ */
/* plain-English activity                                              */
/* ------------------------------------------------------------------ */

/** Turn one logged message into a sentence a HOD understands (null = technical, hide it). */
function friendly(e) {
  const [detail, delivery] = String(e.detail || '').split(' | ');
  const failed = e.status === 'failed';
  const tail = failed ? ' — but the school ERP didn’t answer.' : e.status === 'sending' ? ' (sending…)' : '';
  if (e.direction === 'out') {
    const [what, who] = detail.split(' → ');
    const say = {
      'leave.approved': [`Told the school ERP that ${what.split(' · ')[0]}’s leave is approved`, 'sage'],
      'leave.declined': [`Told the school ERP that ${what.split(' · ')[0]}’s leave was declined`, 'clay'],
      'cover.assigned': [`${who || 'A teacher'} will take ${what} — the school ERP now shows it`, 'sage'],
      'cover.passed': [`${what} is now offered to ${who || 'the next teacher'}`, 'brass'],
      'cover.failed': [`Nobody was free for ${what}`, 'clay'],
      ping: ['Sent a test message to the school ERP', 'muted'],
    }[e.kind];
    if (!say) return null;
    return { text: `${say[0]}${tail || '.'}`, tone: failed ? 'clay' : say[1], delivery };
  }
  if (e.kind === 'leave') {
    const [name, when] = detail.split(' · ');
    if (detail.includes('waiting for the HOD')) return { text: `${name} asked for leave (${when}). It’s waiting for your OK on the dashboard.`, tone: 'brass' };
    if (detail.includes('approved in the ERP')) return { text: `${name}’s leave (${when}) came in already approved. Finding substitutes.`, tone: 'sage' };
    return { text: `${detail.replace(':', '’s leave came in:')}.`, tone: 'muted' };
  }
  if (e.kind === 'sync') {
    return e.status === 'ok'
      ? { text: `Got the latest teachers and timetable from the school ERP (${detail}).`, tone: 'muted' }
      : { text: `Couldn’t read the school ERP: ${detail}`, tone: 'clay' };
  }
  if (e.kind === 'connect') return { text: `${detail}.`, tone: 'sage' };
  if (e.kind === 'disconnect') return { text: 'Unlinked from the school ERP.', tone: 'muted' };
  if (['teachers', 'students', 'timetable'].includes(e.kind)) {
    return { text: `The school ERP sent its ${e.kind === 'timetable' ? 'timetable' : `${e.kind.slice(0, -1)} list`} (${detail}).`, tone: 'muted' };
  }
  if (e.status === 'failed') return { text: `The school ERP sent something ProxyPilot couldn’t use: ${detail}`, tone: 'clay' };
  return null;
}

const DOT = { sage: 'bg-sage', brass: 'bg-brass', clay: 'bg-clay', muted: 'bg-muted' };

/* ------------------------------------------------------------------ */
/* small pieces                                                        */
/* ------------------------------------------------------------------ */

function Copy({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      className="shrink-0 rounded-md border border-line px-2 py-1 font-mono text-[11px] text-ink/80 hover:border-brass/60"
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function Field({ label, children, hint, as: Tag = 'div' }) {
  return (
    <Tag className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </Tag>
  );
}

const input = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-brass';

/** a secret shown once, right after it is made */
function OneTime({ label, value, onClose }) {
  if (!value) return null;
  return (
    <div className="mt-3 rounded-md border border-brass/50 bg-brass-soft/60 p-3">
      <div className="text-sm font-semibold text-ink">{label}: copy it now, it won’t be shown again</div>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-paper/80 px-2 py-1.5 font-mono text-xs text-ink">{value}</code>
        <Copy text={value} />
      </div>
      <button onClick={onClose} className="mt-2 text-xs font-semibold text-brass-2 hover:underline">I’ve saved it</button>
    </div>
  );
}

/** two boxes joined by a line: the school's software and ProxyPilot */
function LinkMark({ on }) {
  return (
    <svg viewBox="0 0 64 40" className="hidden h-11 w-[70px] shrink-0 sm:block" aria-hidden="true">
      <rect x="2" y="8" width="22" height="24" rx="6" fill="none" stroke="#edf2ec" strokeOpacity="0.8" strokeWidth="2" />
      <path d="M8 16h10M8 21h10M8 26h6" stroke="#edf2ec" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
      <path d="M26 20h12" stroke={on ? '#62d39b' : '#94a59b'} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={on ? '0' : '3 4'} />
      <circle cx="32" cy="20" r="3.2" fill={on ? '#62d39b' : '#94a59b'} />
      <rect x="40" y="8" width="22" height="24" rx="6" fill={on ? '#2e2912' : 'none'} stroke="#f4c542" strokeWidth="2" />
      <rect x="46" y="14" width="4" height="4" rx="1" fill="#f4c542" />
      <rect x="52" y="14" width="4" height="4" rx="1" fill="#edf2ec" fillOpacity="0.7" />
      <rect x="46" y="21" width="4" height="4" rx="1" fill="#edf2ec" fillOpacity="0.7" />
      <rect x="52" y="21" width="4" height="4" rx="1" fill="#edf2ec" fillOpacity="0.5" />
    </svg>
  );
}

function Chip({ children }) {
  return <span className="rounded-full border border-line bg-paper/50 px-3 py-1 text-xs text-ink/85">{children}</span>;
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export default function Erp() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [secret, setSecret] = useState({ label: '', value: '' });
  const [form, setForm] = useState({ erpName: '', pullUrl: '', pullKey: '', webhookUrl: '' });
  const [saved, setSaved] = useState('');
  const techRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/erp');
      setData(data);
      return data;
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  const fillForm = (c) => setForm({ erpName: c?.erpName || '', pullUrl: c?.pullUrl || '', pullKey: '', webhookUrl: c?.webhookUrl || '' });

  useEffect(() => {
    load().then((d) => d && fillForm(d.connection));
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  useLive(() => load());

  const run = async (name, fn) => {
    setBusy(name);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
      load();
    }
  };

  if (!data) return <p className="text-muted">{error || 'Loading…'}</p>;
  const c = data.connection;
  const s = c.lastSync;
  const updates = data.events.map((e) => ({ e, f: friendly(e) })).filter((x) => x.f).slice(0, 8);

  const connectDemo = () => run('demo', async () => { const r = await api.post('/erp/connect-demo'); fillForm(r.data.connection); });
  const openTech = () => {
    if (techRef.current) {
      techRef.current.open = true;
      techRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/hod" className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted hover:text-ink">← Dashboard</Link>
        <h1 className="mt-1 font-display text-4xl tracking-tight text-ink">School ERP</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-ink/75">
          Link ProxyPilot to the software your school already uses. Leaves come in by themselves, and the school’s timetable always shows who is covering.
        </p>
      </div>
      <ErrorBox text={error} />

      {/* ---------- where things stand ---------- */}
      <section className="glass rounded-[18px] p-5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] sm:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <LinkMark on={c.connected} />
            <div className="min-w-0">
              {c.connected ? (
                <>
                  <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-sage">
                    <span className="h-2 w-2 rounded-full bg-sage shadow-[0_0_10px_2px_rgba(98,211,155,0.55)]" /> Linked
                  </div>
                  <h2 className="mt-0.5 font-display text-[2rem] leading-tight text-ink">{c.erpName || 'Your school ERP'}</h2>
                  <p className="text-sm text-muted">
                    {s ? `Up to date · checked ${ago(c.lastSyncAt)}` : c.pullUrl ? 'Not read yet. Press “Get latest”.' : 'Your ERP sends its data to ProxyPilot by itself.'}
                  </p>
                  {s && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Chip>{n(s.teachers, 'teacher')}</Chip>
                      <Chip>{n(s.classes, 'class', 'classes')}</Chip>
                      <Chip>{n(s.periods, 'period')} a week</Chip>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Not linked yet</div>
                  <h2 className="mt-0.5 font-display text-[2rem] leading-tight text-ink">See it work in one click</h2>
                  <p className="max-w-lg text-sm text-ink/75">Try it with a pretend school that comes with ProxyPilot. Linking your real school ERP is in “Technical setup” below.</p>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            {c.connected ? (
              <>
                {c.isDemo && (
                  <a href="/demo-erp" target="_blank" rel="noreferrer" className={`${btnLink} bg-brass text-paper hover:brightness-110`}>
                    Open the school ERP <span aria-hidden="true">↗</span>
                  </a>
                )}
                {c.pullUrl && (
                  <Button variant="ghost" disabled={!!busy} onClick={() => run('sync', () => api.post('/erp/sync'))}>
                    {busy === 'sync' ? 'Getting…' : 'Get latest'}
                  </Button>
                )}
              </>
            ) : (
              <Button variant="brass" className="!px-5 !py-2.5" disabled={!!busy} onClick={connectDemo}>
                {busy === 'demo' ? 'Setting it up…' : 'Try with a demo school'}
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
        {/* ---------- how it works ---------- */}
        <Card
          className="lg:col-span-3"
          title={c.isDemo ? 'Try it yourself' : 'How it works'}
          subtitle={c.isDemo ? 'Three steps, about a minute' : 'Once linked, this happens by itself'}
        >
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              {
                t: 'A teacher takes leave',
                d: c.isDemo ? 'Open the school ERP and send a leave. Everything is already filled in.' : 'It is entered in the school ERP as usual. ProxyPilot gets it at once.',
                a: c.isDemo && (
                  <a href="/demo-erp" target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-brass hover:underline">
                    Open the school ERP ↗
                  </a>
                ),
              },
              {
                t: 'ProxyPilot finds a substitute',
                d: c.isDemo ? 'It asks the best free teacher. In the school ERP, press “Open as …” to answer as her.' : 'It asks the best free teacher. If they can’t, it asks the next one.',
              },
              {
                t: 'Everyone sees who covers',
                d: c.isDemo ? 'When she says yes, the school ERP’s “Today’s changes” shows her name by itself.' : 'The school ERP’s timetable shows the substitute by itself.',
              },
            ].map((step, i) => (
              <li key={step.t} className="rounded-[12px] border border-line bg-paper/50 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brass font-mono text-sm font-semibold text-paper">{i + 1}</div>
                <div className="mt-3 font-semibold text-ink">{step.t}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.d}</p>
                {step.a}
              </li>
            ))}
          </ol>
        </Card>

        {/* ---------- latest updates ---------- */}
        <Card className="lg:col-span-2" title="Latest updates" subtitle="What ProxyPilot and the school ERP told each other">
          {updates.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              {c.connected ? 'Nothing yet. Send a leave from the school ERP and it shows up here.' : 'Link a school ERP to see updates here.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {updates.map(({ e, f }) => (
                <li key={e.id} className="flex gap-3">
                  <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${DOT[f.tone]}`} />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug text-ink/90">{f.text}</p>
                    <p className="mt-0.5 text-xs text-muted">{ago(e.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.events.length > 0 && (
            <button onClick={openTech} className="mt-4 text-xs font-semibold text-muted hover:text-ink">
              Full technical log ↓
            </button>
          )}
        </Card>
      </div>

      {/* ---------- technical setup (folded away) ---------- */}
      <details ref={techRef} className="glass group rounded-[14px] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="font-display text-[1.45rem] leading-tight text-ink">Technical setup</h2>
            <p className="text-sm text-muted">For the company that runs your school ERP. Not needed for the demo.</p>
          </div>
          <span className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink/80 transition group-open:rotate-180" aria-hidden="true">⌄</span>
        </summary>

        <div className="space-y-6 border-t border-line px-5 pb-6 pt-5">
          <p className="text-sm text-ink/75">
            Send these to your ERP company along with the{' '}
            <a className="font-semibold text-brass hover:underline" href={GUIDE_URL} target="_blank" rel="noreferrer">step-by-step guide ↗</a>.
            Every update ProxyPilot sends is signed, so the ERP can be sure it’s genuine.
          </p>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="ProxyPilot API address">
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-paper/60 px-3 py-2 font-mono text-xs text-ink">{data.apiBase}</code>
                  <Copy text={data.apiBase} />
                </div>
              </Field>
              <Field label="API key" hint="The ERP sends it with every call. A new key stops the old one at once.">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-ink/80">{c.hasApiKey ? <>Active key ending <code className="font-mono">…{c.apiKeyHint}</code></> : 'No key yet'}</span>
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={!!busy}
                    onClick={() => (!c.hasApiKey || window.confirm('Make a new API key? The ERP must switch to it.')) && run('key', async () => { const r = await api.post('/erp/api-key'); setSecret({ label: 'Your new API key', value: r.data.apiKey }); })}
                  >
                    {c.hasApiKey ? 'Make a new key' : 'Create API key'}
                  </Button>
                </div>
              </Field>
              <Field label="Webhook signing secret" hint="The ERP uses it to check each update is really from ProxyPilot.">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-ink/80">{c.hasWebhookSecret ? 'Set' : 'Not set'}</span>
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={!!busy}
                    onClick={() => (!c.hasWebhookSecret || window.confirm('Make a new secret? The ERP must switch to it.')) && run('secret', async () => { const r = await api.post('/erp/webhook-secret'); setSecret({ label: 'Your webhook signing secret', value: r.data.webhookSecret }); })}
                  >
                    {c.hasWebhookSecret ? 'Make a new secret' : 'Create secret'}
                  </Button>
                </div>
              </Field>
              <OneTime label={secret.label} value={secret.value} onClose={() => setSecret({ label: '', value: '' })} />
            </div>

            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                run('save', async () => {
                  const r = await api.post('/erp/settings', form);
                  fillForm(r.data.connection);
                  setSaved('Saved.');
                  setTimeout(() => setSaved(''), 2500);
                });
              }}
            >
              <Field as="label" label="ERP name">
                <input className={input} value={form.erpName} onChange={(e) => setForm({ ...form, erpName: e.target.value })} placeholder="e.g. Teachmint, Entab" />
              </Field>
              <Field as="label" label="Webhook address" hint="Where ProxyPilot sends updates (https).">
                <input className={input} value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} placeholder="https://erp.yourschool.in/webhook" />
              </Field>
              <Field as="label" label="ERP API address" hint="Where “Get latest” reads teachers and timetable.">
                <input className={input} value={form.pullUrl} onChange={(e) => setForm({ ...form, pullUrl: e.target.value })} placeholder="https://erp.yourschool.in/api" />
              </Field>
              <Field as="label" label="ERP API key" hint={c.hasPullKey ? 'A key is saved. Leave empty to keep it.' : 'Only if your ERP gave you one.'}>
                <input className={input} type="password" autoComplete="off" value={form.pullKey} onChange={(e) => setForm({ ...form, pullKey: e.target.value })} placeholder={c.hasPullKey ? '•••••••• saved' : 'Optional'} />
              </Field>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <Button type="submit" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save details'}</Button>
                {c.webhookUrl && (
                  <Button type="button" variant="ghost" disabled={!!busy} onClick={() => run('test', () => api.post('/erp/test-webhook'))}>
                    {busy === 'test' ? 'Sending…' : 'Send a test update'}
                  </Button>
                )}
                {saved && <span className="text-sm text-sage">{saved}</span>}
              </div>
            </form>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Full technical log</h3>
            {data.events.length === 0 ? (
              <p className="text-sm text-muted">No messages yet.</p>
            ) : (
              <div className="max-h-[420px] overflow-auto rounded-md border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-paper-2">
                    <tr className="text-left text-xs uppercase text-muted">
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Way</th>
                      <th className="px-3 py-2">What</th>
                      <th className="px-3 py-2">Details</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {data.events.map((e) => {
                      const [what, how] = String(e.detail || '').split(' | ');
                      return (
                        <tr key={e.id} className="align-top">
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{ago(e.created_at)}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">
                            {e.direction === 'in' ? <span className="text-brass-2">ERP → PP</span> : <span className="text-sage">PP → ERP</span>}
                          </td>
                          <td className="px-3 py-2 font-mono text-[12px] text-ink">{e.kind}</td>
                          <td className="px-3 py-2 text-ink/80">
                            {what}
                            {how && <div className="text-xs text-muted">{how}{e.attempts > 1 ? ` · ${e.attempts} tries` : ''}</div>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-block rounded px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${e.status === 'ok' ? 'bg-sage-soft text-sage' : e.status === 'failed' ? 'bg-clay-soft text-clay' : 'bg-brass-soft text-brass-2'}`}>
                              {e.status === 'ok' ? 'OK' : e.status === 'failed' ? 'Failed' : 'Sending'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {c.connected && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-clay/25 bg-clay-soft/40 px-4 py-3">
              <p className="text-sm text-ink/80">Unlink the school ERP. Its keys stop working at once.</p>
              <Button
                variant="ghost"
                disabled={!!busy}
                onClick={() => window.confirm('Unlink the school ERP? Its keys stop working at once.') && run('disconnect', async () => { const r = await api.post('/erp/disconnect'); fillForm(r.data.connection); })}
              >
                {busy === 'disconnect' ? 'Unlinking…' : 'Unlink'}
              </Button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
