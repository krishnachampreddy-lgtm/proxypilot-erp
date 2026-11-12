import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorText } from '../api';
import { Button, Card, Empty, ErrorBox } from '../components/ui.jsx';
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
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{label}</span>
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
      <div className="text-sm font-semibold text-ink">{label} — copy it now, it won’t be shown again</div>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-paper/80 px-2 py-1.5 font-mono text-xs text-ink">{value}</code>
        <Copy text={value} />
      </div>
      <button onClick={onClose} className="mt-2 text-xs font-semibold text-brass-2 hover:underline">I’ve saved it</button>
    </div>
  );
}

const IN = [
  ['Teachers', 'name, email, subjects — matched by the ERP’s own id'],
  ['Students', 'name, email, class'],
  ['Weekly timetable', 'every class, period, subject and teacher'],
  ['Leaves', 'already approved in the ERP, or sent to the HOD here'],
];
const OUT = [
  ['leave.approved / leave.declined', 'the HOD’s decision, with the classes affected'],
  ['cover.assigned', 'a substitute said yes — the ERP timetable shows them'],
  ['cover.passed', 'no answer or a no — asked the next best teacher'],
  ['cover.failed', 'nobody could take the class'],
];

export default function Erp() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [secret, setSecret] = useState({ label: '', value: '' });
  const [form, setForm] = useState({ erpName: '', pullUrl: '', pullKey: '', webhookUrl: '' });
  const [saved, setSaved] = useState('');

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/hod" className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted hover:text-ink">← Department overview</Link>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight text-ink">School ERP</h1>
          <p className="text-sm text-muted">ProxyPilot works inside your school’s ERP: it reads your staff and timetable, takes leaves from it, and sends every cover back.</p>
        </div>
      </div>
      <ErrorBox text={error} />

      {/* status */}
      <section className="glass rounded-[14px] p-5">
        {c.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-2 h-2.5 w-2.5 rounded-full bg-sage shadow-[0_0_10px_2px_rgba(98,211,155,0.55)]" />
              <div>
                <div className="font-display text-2xl text-ink">Connected to {c.erpName || 'your ERP'}</div>
                <div className="mt-0.5 text-sm text-muted">
                  {s
                    ? `Last sync ${ago(c.lastSyncAt)} · ${n(s.teachers, 'teacher')} · ${n(s.students, 'student')} · ${n(s.periods, 'period')} in ${n(s.classes, 'class', 'classes')}`
                    : c.pullUrl ? 'Not synced yet — press Sync now.' : 'Your ERP sends its data to ProxyPilot’s API.'}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {c.pullUrl && (
                <Button variant="brass" disabled={!!busy} onClick={() => run('sync', () => api.post('/erp/sync'))}>
                  {busy === 'sync' ? 'Syncing…' : 'Sync now'}
                </Button>
              )}
              {c.isDemo && (
                <a href="/demo-erp" target="_blank" rel="noreferrer" className="rounded-[11px] border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-brass/60">
                  Open the demo ERP ↗
                </a>
              )}
              <Button
                variant="ghost"
                disabled={!!busy}
                onClick={() => window.confirm('Disconnect the ERP? Its keys stop working at once.') && run('disconnect', async () => { const r = await api.post('/erp/disconnect'); fillForm(r.data.connection); })}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-display text-2xl text-ink">Not connected yet</div>
              <p className="mt-0.5 max-w-xl text-sm text-muted">
                Try it in one click with the demo school ERP that comes with ProxyPilot, or set up your school’s own ERP below.
              </p>
            </div>
            <Button variant="brass" disabled={!!busy} onClick={() => run('demo', async () => { const r = await api.post('/erp/connect-demo'); fillForm(r.data.connection); })}>
              {busy === 'demo' ? 'Connecting…' : 'Connect the demo ERP'}
            </Button>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="How they work together" subtitle="What travels each way">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-brass">ERP → ProxyPilot</div>
              <ul className="space-y-2">
                {IN.map(([a, b]) => (
                  <li key={a} className="rounded-md border border-line bg-paper/60 px-3 py-2">
                    <div className="text-sm font-semibold text-ink">{a}</div>
                    <div className="text-xs text-muted">{b}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-sage">ProxyPilot → ERP</div>
              <ul className="space-y-2">
                {OUT.map(([a, b]) => (
                  <li key={a} className="rounded-md border border-line bg-paper/60 px-3 py-2">
                    <div className="font-mono text-[12px] font-semibold text-ink">{a}</div>
                    <div className="text-xs text-muted">{b}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted">
            Every update is signed, so the ERP can check it really came from ProxyPilot. Full guide for the ERP’s developers:{' '}
            <a className="text-brass-2 hover:underline" href={GUIDE_URL} target="_blank" rel="noreferrer">ERP API guide ↗</a>
          </p>
        </Card>

        <Card title="Keys for your ERP company" subtitle="Give these to the people who run your ERP">
          <div className="space-y-4">
            <Field label="ProxyPilot API address">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-paper/60 px-3 py-2 font-mono text-xs text-ink">{data.apiBase}</code>
                <Copy text={data.apiBase} />
              </div>
            </Field>
            <Field label="API key" hint="The ERP sends it with every call. Making a new one stops the old one at once.">
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
            <Field label="Webhook signing secret" hint="The ERP uses it to check each update’s signature.">
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
        </Card>
      </div>

      <Card title="Your ERP’s details" subtitle="Where ProxyPilot reads your data and where it sends updates">
        <form
          className="grid gap-4 md:grid-cols-2"
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
            <input className={input} value={form.erpName} onChange={(e) => setForm({ ...form, erpName: e.target.value })} placeholder="e.g. Teachmint, Entab CampusCare" />
          </Field>
          <Field as="label" label="Webhook address" hint="ProxyPilot posts leave and cover updates here (https).">
            <input className={input} value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} placeholder="https://erp.yourschool.in/proxypilot/webhook" />
          </Field>
          <Field as="label" label="ERP API address" hint="For Sync now: ProxyPilot reads /teachers, /students and /timetable here.">
            <input className={input} value={form.pullUrl} onChange={(e) => setForm({ ...form, pullUrl: e.target.value })} placeholder="https://erp.yourschool.in/api/proxypilot" />
          </Field>
          <Field as="label" label="ERP API key" hint={c.hasPullKey ? 'A key is saved. Leave empty to keep it.' : 'The key your ERP gave you, if it needs one.'}>
            <input className={input} type="password" autoComplete="off" value={form.pullKey} onChange={(e) => setForm({ ...form, pullKey: e.target.value })} placeholder={c.hasPullKey ? '•••••••• saved' : 'Optional'} />
          </Field>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <Button type="submit" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save details'}</Button>
            {c.webhookUrl && (
              <Button type="button" variant="ghost" disabled={!!busy} onClick={() => run('test', () => api.post('/erp/test-webhook'))}>
                {busy === 'test' ? 'Sending…' : 'Send a test update'}
              </Button>
            )}
            {saved && <span className="text-sm text-sage">{saved}</span>}
          </div>
        </form>
      </Card>

      <Card title="Activity" subtitle="Every message between ProxyPilot and the ERP">
        {data.events.length === 0 ? (
          <Empty>Nothing yet. Connect an ERP to see messages here.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-2">When</th>
                  <th className="py-2 pr-2">Way</th>
                  <th className="py-2 pr-2">What</th>
                  <th className="py-2 pr-2">Details</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {data.events.map((e) => {
                  const [what, how] = String(e.detail || '').split(' | ');
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap py-2 pr-2 text-xs text-muted">{ago(e.created_at)}</td>
                      <td className="whitespace-nowrap py-2 pr-2 font-mono text-[11px]">
                        {e.direction === 'in' ? <span className="text-brass-2">ERP → PP</span> : <span className="text-sage">PP → ERP</span>}
                      </td>
                      <td className="py-2 pr-2 font-mono text-[12px] text-ink">{e.kind}</td>
                      <td className="py-2 pr-2 text-ink/80">
                        {what}
                        {how && <div className="text-xs text-muted">{how}{e.attempts > 1 ? ` · ${e.attempts} tries` : ''}</div>}
                      </td>
                      <td className="py-2">
                        <span
                          className={`inline-block rounded px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${
                            e.status === 'ok' ? 'bg-sage-soft text-sage' : e.status === 'failed' ? 'bg-clay-soft text-clay' : 'bg-brass-soft text-brass-2'
                          }`}
                        >
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
      </Card>
    </div>
  );
}
