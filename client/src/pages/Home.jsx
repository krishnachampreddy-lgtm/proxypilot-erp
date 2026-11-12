import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CampusScene, { campusMinutesNow } from '../components/campus/CampusScene.jsx';
import { STOPS } from '../campus/stops.js';
import { PHASES, phaseAt, clockLabel, phaseLabel, dayProgress, screenSeconds } from '../campus/day.js';
import { createSoundscape } from '../components/campus/sound.js';
import InstallButton from '../components/InstallButton.jsx';
import { Logo } from '../components/Layout.jsx';

const STEPS = [
  ['01', 'Teacher applies', 'Picks a date — full day, a session, a few periods or several days. Or taps “I’m sick today”.'],
  ['02', 'HOD approves', 'The request lands on the HOD’s dashboard with the classes affected. Declining needs a reason.'],
  ['03', 'Substitute found', 'Each class goes to the fairest free teacher of the same subject first, other subjects as backup.'],
  ['04', 'Everyone knows', 'The substitute accepts in the app, students see the change, and it’s all on record.'],
];

const FEATURES = [
  ['Fair by design', 'Ranks free teachers by subject, whether they know the class, and how many proxies they took this month.'],
  ['No calls, no chains', 'Requests appear in the app with a bell. A decline or no reply passes it to the next teacher.'],
  ['Never an empty class', 'If nobody at all can cover a class, that day’s leave is declined with a clear reason.'],
  ['Leave balance', '12 leaves a year — a full day counts 1, a session ½. Teachers see what’s left before applying.'],
  ['Monthly report', 'One click gives the HOD every leave, decision, substitute and class covered, ready for Excel.'],
  ['Works like an app', 'Install it on any phone. Sign in with a one-time code to your Gmail — no passwords.'],
];

const ROLES = [
  ['Teachers', 'Apply in seconds, see your balance, get cover requests and handover notes in one place.'],
  ['HOD', 'Approve with one tap, watch coverage live, keep proxy load fair, download the monthly report.'],
  ['Students', 'See who is taking your class before the bell rings.'],
];

function Action({ to, onClick, title, sub, primary }) {
  const cls = `group flex w-full items-center justify-between gap-4 rounded-[11px] border px-4 py-3 text-left transition ${
    primary ? 'border-brass/70 bg-brass text-paper hover:brightness-110' : 'border-[rgb(200_235_220/0.16)] bg-[rgb(8_14_12/0.45)] text-ink hover:border-brass/60'
  }`;
  const body = (
    <>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className={`hidden font-mono text-[10px] uppercase tracking-[0.14em] sm:inline ${primary ? 'text-paper/70' : 'text-muted'}`}>{sub}</span>
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

/** frame the 3D action beside the hero card: to its right on wide screens, above it on phones */
function frameFor(w) {
  if (w >= 1024) return { x: Math.min(0.24, (Math.min(560, w - 64) + 32) / w / 2), y: 0 };
  if (w >= 640) return { x: 0.12, y: -0.08 };
  return { x: 0, y: -0.2 };
}

const CENTRED = { x: 0, y: 0 };

function BellIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

/** The school day as a strip: each part of the day, a moving "now" marker, tap to jump. */
function DayStrip({ minutes, onJump, compact = false }) {
  const at = dayProgress(minutes);
  const current = phaseAt(minutes);
  const total = PHASES.reduce((sum, p) => sum + screenSeconds(p), 0);
  return (
    <div className="relative">
      <div className="flex h-7 overflow-hidden rounded-[8px] border border-[rgb(200_235_220/0.14)]">
        {PHASES.map((p) => {
          const on = p.id === current.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onJump(p.jump)}
              title={`${p.label} · ${clockLabel(p.from)}`}
              style={{ flexGrow: screenSeconds(p) }}
              className={`relative min-w-0 basis-0 border-r border-[rgb(200_235_220/0.1)] px-1 text-left font-mono text-[9px] uppercase tracking-[0.1em] transition last:border-r-0 ${
                on ? 'bg-brass/25 text-ink' : 'text-ink/55 hover:bg-ink/10 hover:text-ink'
              }`}
            >
              {!compact && screenSeconds(p) / total > 0.11 && <span className="block truncate">{p.short}</span>}
            </button>
          );
        })}
      </div>
      <span className="pointer-events-none absolute -bottom-1 -top-1 w-[2px] rounded bg-brass shadow-[0_0_8px_rgba(244,197,66,0.9)] transition-[left] duration-300" style={{ left: `calc(${at * 100}% - 1px)` }} />
    </div>
  );
}

export default function Home() {
  const [stop, setStop] = useState(null); // index of the tour stop, or null
  const [soundOn, setSoundOn] = useState(false);
  const [progress, setProgress] = useState(0);
  const [live, setLive] = useState(false);
  const [clock, setClock] = useState(() => ({ m: campusMinutesNow(), phase: phaseAt(campusMinutesNow()) }));
  const [bell, setBell] = useState(null);
  const [story, setStory] = useState(null); // a ProxyPilot moment happening on campus right now
  const [frame, setFrame] = useState(() => frameFor(typeof window === 'undefined' ? 1280 : window.innerWidth));
  const scene = useRef(null);
  // picture quality: Auto fits the device; HD and 4K are the viewer's own choice (remembered)
  const [quality, setQuality] = useState(() => {
    try {
      return localStorage.getItem('pp-quality') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const audio = useRef(null);
  const startAt = useRef(campusMinutesNow());
  const bellTimer = useRef(null);

  useEffect(() => {
    const onResize = () => setFrame(frameFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => () => {
    audio.current?.stop();
    clearTimeout(bellTimer.current);
  }, []);

  // sound follows the school day
  const phaseId = clock.phase?.id;
  const lateEvening = clock.m >= 17 * 60;
  useEffect(() => {
    audio.current?.setPhase(phaseId, clock.m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseId, lateEvening, soundOn]);

  const onClock = useCallback((m, phase) => setClock({ m, phase }), []);
  const onBell = useCallback((name) => {
    setBell(name);
    clearTimeout(bellTimer.current);
    bellTimer.current = setTimeout(() => setBell(null), 3800);
    audio.current?.bell(name === 'Assembly' || name === 'Home time' ? 7 : 3);
  }, []);

  const onStory = useCallback((st) => setStory(st), []);

  const toggleSound = () => {
    if (soundOn) {
      audio.current?.stop();
      audio.current = null;
      setSoundOn(false);
    } else {
      audio.current = createSoundscape();
      setSoundOn(Boolean(audio.current));
    }
  };

  const jumpTo = (m) => {
    if (stop !== null) endTour();
    scene.current?.jumpTo(m);
  };
  const [inside, setInside] = useState(null); // which room the camera is in (null = outside)
  const lookInside = (room) => {
    if (stop !== null) endTour();
    setInside(room);
    scene.current?.lookInside(room);
  };
  const lookOutside = () => {
    setInside(null);
    scene.current?.lookOutside();
  };
  const changeQuality = (q) => {
    if (q === quality) return;
    try {
      localStorage.setItem('pp-quality', q);
    } catch {
      /* private window: just for this visit */
    }
    startAt.current = Math.floor(clock.m); // the rebuilt campus carries on from the same moment
    setLive(false);
    setProgress(0);
    setQuality(q);
  };
  const nextPhase = () => {
    const i = PHASES.findIndex((p) => p.id === clock.phase?.id);
    jumpTo(PHASES[(i + 1) % PHASES.length].jump);
  };

  const goTo = (i) => {
    setStop(i);
    scene.current?.goTo(i);
    audio.current?.bell(2);
  };
  const endTour = () => {
    setStop(null);
    scene.current?.endTour();
  };

  // the tour moves on by itself every few seconds
  useEffect(() => {
    if (stop === null) return;
    const t = setTimeout(() => (stop < STOPS.length - 1 ? goTo(stop + 1) : endTour()), 9000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  // "Our school": the campus alone, full screen — every button and card out of the way (Esc, or the small exit
  // button that shows when you move, brings them back)
  const [watching, setWatching] = useState(false);
  const [exitShown, setExitShown] = useState(true);
  const exitTimer = useRef(null);
  const startWatching = () => {
    if (stop !== null) endTour();
    if (inside) lookOutside();
    window.scrollTo(0, 0);
    setWatching(true);
    try {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      /* no full screen here (an iPhone): the page alone does it */
    }
  };
  const stopWatching = () => {
    setWatching(false);
    try {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } catch {
      /* already out */
    }
  };
  useEffect(() => {
    if (!watching) return;
    const show = () => {
      setExitShown(true);
      clearTimeout(exitTimer.current);
      exitTimer.current = setTimeout(() => setExitShown(false), 2500);
    };
    const onKey = (e) => e.key === 'Escape' && stopWatching();
    // (leaving full screen — the browser's own Esc — ends it too)
    const onFull = () => !document.fullscreenElement && setWatching(false);
    show();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('pointermove', show);
    window.addEventListener('pointerdown', show);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      document.body.style.overflow = overflow;
      clearTimeout(exitTimer.current);
      window.removeEventListener('pointermove', show);
      window.removeEventListener('pointerdown', show);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFull);
    };
  }, [watching]);

  const s = stop !== null ? STOPS[stop] : null;
  const backdrop = startAt.current >= 17 * 60 ? 'evening' : 'morning';

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* ---------- living campus ---------- */}
      <section className="relative h-[100svh] min-h-[600px] overflow-hidden">
        <CampusScene
          key={quality}
          quality={quality}
          ref={scene}
          time={backdrop}
          startMinutes={startAt.current}
          className="absolute inset-0"
          onProgress={setProgress}
          onClock={onClock}
          onBell={onBell}
          onStory={onStory}
          onReady={(ok) => setLive(ok)}
          onInside={(on) => setInside((r) => (on ? r || 'room' : null))}
          frameShift={watching ? CENTRED : frame}
        />
        {progress > 0 && progress < 1 && (
          <div className="pointer-events-none absolute left-1/2 top-20 z-10 -translate-x-1/2 sm:top-24">
            <div className="glass flex items-center gap-3 rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/80">
              <span>Opening the school gates</span>
              <span className="h-1 w-24 overflow-hidden rounded-full bg-ink/15"><span className="block h-full bg-brass transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
          </div>
        )}
        {/* while watching: just the time and which period it is, small in the corner */}
        {watching && live && (
          <div className="glass pointer-events-none absolute left-4 top-4 z-30 flex h-9 items-center gap-2.5 rounded-[11px] px-3 sm:left-6 sm:top-6" role="status">
            <span className="h-1.5 w-1.5 rounded-full bg-sage shadow-[0_0_8px_2px_rgba(98,211,155,0.55)]" />
            <span className="font-mono text-sm tabular-nums leading-none text-ink">{clockLabel(clock.m)}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-brass">{phaseLabel(clock.m)}</span>
          </div>
        )}
        {watching && (
          <button
            onClick={stopWatching}
            className={`glass absolute right-4 top-4 z-30 flex h-9 items-center gap-1.5 rounded-[11px] px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink/85 hover:text-ink sm:right-6 sm:top-6 ${exitShown ? '' : 'invisible'}`}
            aria-label="Show the page again"
          >
            <span aria-hidden="true">✕</span> Exit
          </button>
        )}
        {/* (shown and hidden at once, never faded: a busy graphics chip can hold a fade back for seconds) */}
        <div className={watching ? 'invisible' : undefined}>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,7,0.45)_0%,transparent_22%,transparent_50%,rgba(5,8,7,0.7)_100%)]" />

        <nav className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-4 py-4 sm:px-8 sm:py-6">
          <Logo />
          <div className="flex items-center gap-2">
            <button onClick={toggleSound} className="glass flex h-9 items-center gap-1.5 rounded-[11px] px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink/85 hover:text-ink" aria-pressed={soundOn}>
              <span aria-hidden="true">{soundOn ? '🔊' : '🔈'}</span>
              <span className="hidden sm:inline">Sound</span>
            </button>
            <Link to="/login" className="flex h-9 items-center rounded-[11px] bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink-3">
              Log in
            </Link>
          </div>
        </nav>

        {/* the campus clock: what time it is at the school and what's happening (out of the way during the tour) */}
        {live && stop === null && (
          <div className="absolute left-4 top-[4.4rem] z-10 sm:left-auto sm:right-8 sm:top-[5.6rem] sm:w-[380px]">
            <div className="glass rounded-[14px] p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-sage" />
                  </span>
                  <span className="font-mono text-lg leading-none tabular-nums sm:text-xl">{clockLabel(clock.m)}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-brass">{phaseLabel(clock.m)}</span>
                </div>
                <button onClick={nextPhase} className="rounded-[8px] border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink/75 hover:border-brass/60 hover:text-ink">
                  Skip ›
                </button>
              </div>
              <p className="mt-2 hidden text-[13px] leading-snug text-ink/70 sm:block">{clock.phase?.now}</p>
              <div className="mt-3 hidden sm:block">
                <DayStrip minutes={clock.m} onJump={jumpTo} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/55">Look inside</span>
                {[['classroom', 'Classroom'], ['staff', 'Staff room'], ['hod', 'HOD office'], ['library', 'Library']].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => lookInside(k)}
                    aria-pressed={inside === k}
                    className={`rounded-[8px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${inside === k ? 'border-brass/70 bg-brass/15 text-ink' : 'border-line text-ink/75 hover:border-brass/60 hover:text-ink'}`}
                  >
                    {label}
                  </button>
                ))}
                {inside && (
                  <button onClick={lookOutside} className="rounded-[8px] bg-brass px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-paper hover:brightness-110">
                    ← Back outside
                  </button>
                )}
              </div>
              <div className="mt-2 hidden items-center gap-1.5 sm:flex">
                <span className="mr-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/55">Quality</span>
                {[['auto', 'Auto'], ['hd', 'HD'], ['4k', '4K']].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => changeQuality(k)}
                    aria-pressed={quality === k}
                    className={`rounded-[8px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${quality === k ? 'border-brass/70 bg-brass/15 text-ink' : 'border-line text-ink/70 hover:text-ink'}`}
                  >
                    {label}
                  </button>
                ))}
                {quality === '4k' && <span className="font-mono text-[10px] text-ink/50">heavy on small laptops</span>}
              </div>
            </div>
          </div>
        )}

        {/* the bell */}
        {bell && (
          <div className="pointer-events-none absolute left-1/2 top-[8.6rem] z-20 -translate-x-1/2 sm:top-24" role="status">
            <div className="glass flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-brass">
              <BellIcon className="h-4 w-4 origin-top animate-[ring_0.5s_ease-in-out_6]" />
              {bell} bell
            </div>
          </div>
        )}

        {/* a ProxyPilot moment on campus: today's cover, as it happens */}
        {story && stop === null && (
          <div className="pointer-events-none absolute left-1/2 top-[11.6rem] z-20 w-[min(92vw,420px)] -translate-x-1/2 sm:top-[9rem]" role="status" aria-live="polite">
            <div key={story.step} className="glass flex gap-3 rounded-[14px] px-4 py-3 animate-[toast-in_0.35s_ease-out]">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${story.step === 'arrived' ? 'bg-sage/20 text-sage' : 'bg-brass/20 text-brass'}`}>
                {story.step === 'arrived' ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m17 11 2 2 4-4" /></svg>
                )}
              </span>
              <div className="min-w-0">
                <p className={`font-mono text-[10px] uppercase tracking-[0.16em] ${story.step === 'arrived' ? 'text-sage' : 'text-brass'}`}>{story.title}</p>
                <p className="mt-0.5 text-sm leading-snug text-ink">{story.lines?.[0]}</p>
                <p className="text-[13px] leading-snug text-ink/70">{story.lines?.[1]}</p>
              </div>
            </div>
          </div>
        )}

        {/* hero card, or the tour caption while touring */}
        <div className="absolute inset-x-3 bottom-3 z-10 sm:inset-x-auto sm:bottom-8 sm:left-8 sm:w-[min(560px,calc(100vw-4rem))]">
          {s ? (
            <div className="glass rounded-[14px] p-5 sm:p-6" aria-live="polite">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-brass">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass" />
                  Stop {stop + 1} / {STOPS.length} · {s.time}
                </span>
                <button onClick={endTour} className="text-lg leading-none text-muted hover:text-ink" aria-label="Stop the tour">
                  ×
                </button>
              </div>
              <h2 className="mt-2 font-display text-4xl leading-none">{s.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink/80">{s.text}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex gap-1.5">
                  {STOPS.map((_, i) => (
                    <button key={i} onClick={() => goTo(i)} aria-label={`Go to stop ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === stop ? 'w-6 bg-brass' : 'w-1.5 bg-ink/30 hover:bg-ink/60'}`} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={endTour} className="rounded-[11px] border border-line px-3 py-1.5 text-sm text-ink/80 hover:text-ink">
                    Stop
                  </button>
                  <button onClick={() => (stop < STOPS.length - 1 ? goTo(stop + 1) : endTour())} className="rounded-[11px] bg-ink px-4 py-1.5 text-sm font-semibold text-paper hover:bg-ink-3">
                    {stop < STOPS.length - 1 ? 'Next ›' : 'Finish'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass rounded-[14px] p-5 sm:p-7">
              <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink/75">
                <span className="h-1.5 w-1.5 rounded-full bg-sage shadow-[0_0_10px_2px_rgba(98,211,155,0.6)]" />
                Every class, covered
              </p>
              <h1 className="mt-3 text-[2.6rem] font-medium uppercase leading-none tracking-tight sm:text-6xl">ProxyPilot</h1>
              <p className="mt-3 font-display text-2xl italic leading-tight sm:text-[1.9rem]">
                A teacher takes leave. <span className="text-brass">The class still happens.</span>
              </p>
              <p className="mt-3 hidden text-[15px] leading-relaxed text-ink/75 sm:block">
                Leave goes to the HOD, the fairest free colleague is found for every class, and students know before the bell — without a single phone call.
              </p>
              <div className="mt-5 space-y-2">
                <Action to="/login#demo" primary title="Try the demo" sub="One tap · no sign-up" />
                <Action to="/login" title="Sign in with Gmail" sub="Teacher · HOD · Student" />
                <Action onClick={() => goTo(0)} title="Take the campus tour" sub={`Guided · ${STOPS.length} stops`} />
                <Action onClick={startWatching} title="Our school" sub="Full screen · just the campus" />
              </div>
            </div>
          )}
        </div>

        <p className="pointer-events-none absolute bottom-8 right-8 z-10 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-ink/60 lg:block">
          Drag to look around · the camera follows the day ↓
        </p>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brass">How it works</p>
        <h2 className="mt-2 font-display text-4xl sm:text-5xl">From leave request to covered class</h2>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([n, title, body]) => (
            <li key={n} className="glass rounded-[14px] p-5">
              <span className="font-mono text-sm text-brass">{n}</span>
              <h3 className="mt-2 font-display text-2xl">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- features: a chalkboard ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-16 lg:px-8">
        <div className="rounded-[14px] border-[6px] border-[#6b4a32] bg-board p-6 shadow-[inset_0_0_80px_rgba(0,0,0,0.45)] sm:p-10">
          <h2 className="font-display text-4xl text-[#f3f0e4] sm:text-5xl">Built around how schools really work</h2>
          <div className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([title, body]) => (
              <div key={title} className="border-l-2 border-brass pl-4">
                <h3 className="text-base font-semibold text-[#f3f0e4]">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#f3f0e4]/70">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- roles ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-16 lg:px-8">
        <h2 className="font-display text-4xl sm:text-5xl">One app, three views</h2>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {ROLES.map(([who, body]) => (
            <div key={who} className="glass rounded-[14px] p-6">
              <h3 className="font-display text-3xl text-brass">{who}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/75">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- call to action ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-20 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-5 rounded-[14px] border border-brass/50 bg-brass-soft p-8 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-3xl">See it in two minutes</h2>
            <p className="mt-1 text-sm text-ink/70">Log in as a teacher, the HOD or a student with one tap — no sign-up needed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/login#demo" className="rounded-[11px] bg-brass px-5 py-2.5 text-sm font-semibold text-paper hover:brightness-110">
              Try the demo
            </Link>
            <InstallButton variant="hero" />
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <Logo />
          <span>Leave requests, HOD approval and substitute lectures — automated.</span>
        </div>
      </footer>
    </div>
  );
}
