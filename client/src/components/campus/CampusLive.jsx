import { useEffect, useMemo, useRef, useState } from 'react';
import { ROOMS, roomFor } from '../../campus/rooms.js';

const RANK = { uncovered: 3, pending: 2, accepted: 1 };
const STATUS = {
  accepted: ['Covered', 'bg-sage', 'text-sage'],
  pending: ['Waiting', 'bg-brass', 'text-brass'],
  uncovered: ['Not covered', 'bg-clay', 'text-clay'],
};

/** today's cover requests, grouped by class (one classroom each) */
function byClass(data) {
  const groups = new Map();
  for (const c of data?.classes || []) {
    if (!groups.has(c.className)) groups.set(c.className, []);
    groups.get(c.className).push(c);
  }
  return [...groups.entries()].map(([className, list]) => {
    const room = ROOMS.indexOf(roomFor(className, data.allClasses || [className]));
    const status = list.reduce((w, c) => (RANK[c.status] > RANK[w] ? c.status : w), 'accepted');
    const one = list[0];
    const sub =
      list.length > 1
        ? `${list.length} periods · ${list.filter((c) => c.status === 'accepted').length} covered`
        : one.status === 'accepted'
          ? `P${one.period} · ${one.substitute}`
          : one.status === 'pending'
            ? `P${one.period} · asked ${one.offeredTo || 'next teacher'}`
            : `P${one.period} · not covered`;
    return { className, room, status, list, title: className, sub };
  });
}

/**
 * The live campus for the HOD: the real time of day, with every classroom that
 * needs cover today glowing — green covered, yellow waiting for a reply, red not covered.
 */
export default function CampusLive({ data }) {
  const mount = useRef(null);
  const api = useRef(null);
  const [state, setState] = useState('idle'); // idle | loading | ready | failed
  const [progress, setProgress] = useState(0);
  const [want, setWant] = useState(() => !window.matchMedia?.('(pointer: coarse)').matches);
  const groups = useMemo(() => byClass(data), [data]);

  // load the 3D campus once it scrolls into view (on phones only when asked)
  useEffect(() => {
    if (!want || !mount.current) return;
    let disposed = false;
    const start = async () => {
      setState('loading');
      try {
        const mod = await import('../../campus/index.js');
        await mod.prepared.catch(() => {});
        if (disposed || !mount.current) return;
        const d = new Date();
        api.current = mod.createCampus(mount.current, {
          mode: 'hod',
          startMinutes: d.getHours() * 60 + d.getMinutes(),
          onProgress: (p) => !disposed && setProgress(p),
          onReady: (ok) => !disposed && setState(ok ? 'ready' : 'failed'),
        });
        if (!api.current) setState('failed');
      } catch {
        if (!disposed) setState('failed');
      }
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        io.disconnect();
        start();
      }
    });
    io.observe(mount.current);
    return () => {
      disposed = true;
      io.disconnect();
      api.current?.dispose();
      api.current = null;
    };
  }, [want]);

  useEffect(() => {
    if (state === 'ready') api.current?.setCover(groups);
  }, [state, groups]);

  const counts = { accepted: 0, pending: 0, uncovered: 0 };
  for (const c of data?.classes || []) counts[c.status]++;

  return (
    <section className="glass overflow-hidden rounded-[14px]">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-brass">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage" /> Live · {data?.prettyDate || 'today'}
          </p>
          <h2 className="mt-1 font-display text-3xl text-ink">Today on campus</h2>
          <p className="text-sm text-muted">Every classroom that needs a substitute today, lit up on the school itself.</p>
        </div>
        <div className="flex flex-wrap gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink/75">
          {Object.entries(STATUS).map(([k, [label, dot]]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              {label} · {counts[k]}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid lg:grid-cols-5">
        <div className="relative h-[300px] bg-[radial-gradient(ellipse_at_50%_30%,rgba(244,197,66,0.08),transparent_60%)] sm:h-[380px] lg:col-span-3">
          <div ref={mount} className="absolute inset-0" />
          {state !== 'ready' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              {!want ? (
                <button onClick={() => setWant(true)} className="rounded-[11px] border border-brass/60 bg-brass/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-brass/25">
                  Show the live campus (3D)
                </button>
              ) : state === 'failed' ? (
                <p className="px-6 text-sm text-muted">This device can’t draw the 3D campus — the list shows everything.</p>
              ) : (
                <>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink/70">Opening the campus</p>
                  <span className="h-1 w-40 overflow-hidden rounded-full bg-ink/15">
                    <span className="block h-full bg-brass transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </span>
                </>
              )}
            </div>
          )}
          {state === 'ready' && (
            <button onClick={() => api.current?.overview()} className="glass absolute bottom-3 left-3 rounded-[9px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/80 hover:text-ink">
              Whole campus
            </button>
          )}
        </div>

        <div className="max-h-[380px] overflow-y-auto border-t border-line p-4 lg:col-span-2 lg:border-l lg:border-t-0">
          {groups.length === 0 ? (
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center text-center">
              <p className="font-display text-2xl text-ink">Every class has its teacher</p>
              <p className="mt-1 text-sm text-muted">Nobody is on leave today. Approved leaves light up here.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {groups.map((g) => (
                <li key={g.className}>
                  <button
                    onClick={() => api.current?.focusRoom(g.room)}
                    disabled={state !== 'ready'}
                    className="w-full rounded-[11px] border border-line bg-paper/40 p-3 text-left transition enabled:hover:border-brass/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{g.className}</span>
                      <span className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${STATUS[g.status][2]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS[g.status][1]}`} />
                        {STATUS[g.status][0]}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted">{ROOMS[g.room]?.where}</div>
                    <ul className="mt-2 space-y-1 text-[13px] text-ink/80">
                      {g.list.map((c) => (
                        <li key={c._id} className="flex justify-between gap-2">
                          <span>
                            P{c.period} · {c.subject} <span className="text-muted">for {c.absent}</span>
                          </span>
                          <span className={STATUS[c.status][2]}>{c.status === 'accepted' ? c.substitute : c.status === 'pending' ? `asked ${c.offeredTo || '…'}` : '—'}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
