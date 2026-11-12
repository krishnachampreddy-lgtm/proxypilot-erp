import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import api, { errorText } from '../api';
import { Logo } from '../components/Layout.jsx';
import { CampusBackdrop, timeOfDayNow } from '../components/campus/CampusScene.jsx';
import { Button, ErrorBox } from '../components/ui.jsx';

const DEMO = [
  { label: 'Dr. Anita Mehta', role: 'Faculty · applies leave', email: 'mehta@college.edu' },
  { label: 'Prof. Ravi Rao', role: 'Faculty · gets proxy requests', email: 'rao@college.edu' },
  { label: 'Prof. Farhan Ali', role: 'Faculty · gets proxy requests', email: 'ali@college.edu' },
  { label: 'Rahul Attuluri', role: 'HOD · dashboard', email: 'hod@college.edu' },
  { label: 'Aarav Sharma', role: 'Student · CSE-2A', email: 'aarav@college.edu' },
];

const input = 'w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-brass';
const link = 'font-medium text-brass-2 hover:underline';
const ROLE = { faculty: 'Faculty', hod: 'HOD', student: 'Student' };

function Avatar({ name, src }) {
  if (src) return <img src={src} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />;
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-board font-display text-base text-brass">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default function Login() {
  const { login, setSession, saved, quickLogin, forget } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // "Try the demo" from the home page jumps straight to the demo buttons
  useEffect(() => {
    if (window.location.hash === '#demo') setTimeout(() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' }), 150);
  }, []);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = () =>
    run(async () => {
      if (name.trim().length < 2) throw { response: { data: { error: 'Please enter your name' } } };
      await api.post('/auth/email-code', { email, purpose: 'login' });
      setCodeSent(true);
      setCode('');
      setNotice(`OTP sent to ${email}. Check your inbox (and spam).`);
    });

  const submit = (e) => {
    e.preventDefault();
    if (!codeSent) return sendOtp();
    run(async () => setSession((await api.post('/auth/email-login', { email, code, name: name.trim() })).data));
  };

  const openSaved = (a) =>
    run(async () => {
      try {
        await quickLogin(a);
      } catch {
        // session expired: ask for a fresh OTP, details pre-filled
        setName(a.name);
        setEmail(a.email);
        setCodeSent(false);
        throw { response: { data: { error: `Your session expired. Tap "Send OTP" to sign in again as ${a.name}.` } } };
      }
    });

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper text-ink">
      <CampusBackdrop time={timeOfDayNow()} drift className="fixed inset-0" />
      {/* soft wash so text stays readable over the campus */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(5,8,7,0.82)_0%,rgba(5,8,7,0.45)_55%,rgba(5,8,7,0.6)_100%)]" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl gap-10 px-5 py-8 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:px-8">
        <section className="flex flex-col justify-between gap-10 lg:min-h-[78vh]">
          <Link to="/" aria-label="ProxyPilot home"><Logo dark /></Link>
          <div>
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink/75"><span className="h-1.5 w-1.5 rounded-full bg-sage shadow-[0_0_10px_2px_rgba(98,211,155,0.6)]" />Proxy lectures, handled</p>
            <h1 className="mt-4 font-display text-[2.8rem] leading-[1.02] tracking-tight text-ink sm:text-7xl">
              Every class,<br />
              <em className="text-brass">covered.</em>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink/75">
              A teacher applies for leave. The HOD approves. ProxyPilot finds the fairest free colleague for each class,
              gets a yes, and tells the students. No calls. No WhatsApp chains.
            </p>

            <div className="glass mt-8 max-w-sm rounded-[14px] p-4 font-mono text-xs">
              <div className="flex items-center justify-between text-ink/55">
                <span>TODAY · P4 · 11:50</span>
                <span className="flex items-center gap-1.5 text-sage"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage" /> live</span>
              </div>
              <div className="mt-3 text-ink/90">CSE-2B · DBMS</div>
              <div className="mt-1 text-ink/50 line-through">Dr. Anita Mehta</div>
              <div className="mt-1 text-brass">→ Prof. Ravi Rao accepted · 38 s</div>
            </div>
          </div>
          <p className="hidden font-mono text-[11px] uppercase tracking-wider text-ink/45 lg:block">Every class, covered</p>
        </section>

        <section className="w-full max-w-md justify-self-center lg:justify-self-end">
          <div className="glass space-y-4 rounded-[14px] p-6 text-ink shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] sm:p-7">
            {saved.length > 0 && !codeSent && (
              <div>
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">Continue as</p>
                <div className="space-y-2">
                  {saved.map((a) => (
                    <div key={a.email} className="flex items-center gap-2">
                      <button disabled={busy} onClick={() => openSaved(a)} className="flex flex-1 items-center gap-3 rounded-md border border-line bg-white px-3 py-2 text-left transition hover:border-brass">
                        <Avatar name={a.name} src={a.avatar} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{a.name}</span>
                          <span className="block truncate text-xs text-muted">{a.email}{a.role ? ` · ${ROLE[a.role]}` : ''}</span>
                        </span>
                        <span className="text-brass-2">→</span>
                      </button>
                      <button onClick={() => forget(a.email)} title="Remove from this device" className="rounded px-2 py-1 text-lg text-muted hover:bg-paper-2 hover:text-ink">×</button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 h-px bg-line" />
              </div>
            )}

            <div>
              <h2 className="font-display text-3xl tracking-tight">{codeSent ? 'Check your inbox' : 'Sign in'}</h2>
              <p className="mt-1 text-sm text-muted">{codeSent ? `We sent a 6-digit code to ${email}.` : 'With your Gmail. No password needed.'}</p>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {!codeSent ? (
                <>
                  <input className={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  <input className={input} type="email" placeholder="yourname@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </>
              ) : (
                <input className={`${input} text-center font-mono text-2xl tracking-[0.6em]`} inputMode="numeric" maxLength={6} placeholder="······" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
              )}

              {notice && codeSent && <p className="text-xs text-muted">Can’t see it? Check the Spam folder.</p>}
              <ErrorBox text={error} />

              <Button type="submit" disabled={busy || (codeSent && code.length !== 6)} className="w-full py-2.5">
                {busy ? 'Please wait…' : codeSent ? 'Verify & sign in' : 'Send OTP'}
              </Button>

              {codeSent && (
                <div className="flex justify-between text-sm">
                  <button type="button" className={link} onClick={() => { setCodeSent(false); setError(''); }}>Change email</button>
                  <button type="button" className={link} disabled={busy} onClick={sendOtp}>Resend code</button>
                </div>
              )}
            </form>

          </div>

          <div id="demo" className="mt-5 scroll-mt-6">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink/60">Try the demo as</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEMO.map((d) => (
                <button key={d.email} disabled={busy} onClick={() => run(() => login(d.email, 'demo123'))} className="glass rounded-[11px] px-3 py-2 text-left transition hover:border-brass/70">
                  <span className="block truncate text-[13px] font-medium text-ink">{d.label}</span>
                  <span className="block truncate font-mono text-[10px] uppercase tracking-wide text-ink/50">{d.role.split(' · ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
