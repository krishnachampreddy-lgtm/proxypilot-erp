import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { startLive, stopLive, useLive, useLiveStatus, describe } from '../live.js';
import { CampusBackdrop, timeOfDayNow } from './campus/CampusScene.jsx';
import NotificationBell from './NotificationBell.jsx';
import InstallButton from './InstallButton.jsx';

// Mark: a 3x3 timetable with one period covered in brass
export function Mark({ className = 'h-8 w-8', dark = false }) {
  const base = dark ? '#edf2ec' : '#edf2ec';
  const cells = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      cells.push(<rect key={`${r}${c}`} x={4 + c * 9} y={4 + r * 9} width="7" height="7" rx="1.6" fill={r === 1 && c === 2 ? '#f4c542' : base} opacity={r === 1 && c === 2 ? 1 : 0.85 - r * 0.15} />);
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      {cells}
    </svg>
  );
}

export function Logo({ dark = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark dark={dark} />
      <span className="font-mono text-[13px] font-medium uppercase tracking-[0.18em] text-ink">ProxyPilot</span>
    </div>
  );
}

/** small cards in the corner for live events meant for this person */
function LiveToasts({ role }) {
  const [items, setItems] = useState([]);
  const id = useRef(0);
  useLive((ev) => {
    const text = describe(ev, role);
    if (!text) return;
    const key = ++id.current;
    setItems((list) => [...list.slice(-2), { key, text, tone: ev.action === 'declined' || ev.action === 'expired' ? 'clay' : ev.action === 'accepted' || ev.action === 'approved' ? 'sage' : 'brass' }]);
    setTimeout(() => setItems((list) => list.filter((i) => i.key !== key)), 6000);
  });
  if (!items.length) return null;
  const dot = { clay: 'bg-clay', sage: 'bg-sage', brass: 'bg-brass' };
  return (
    <div className="pointer-events-none fixed right-3 top-16 z-50 flex w-[min(360px,calc(100vw-1.5rem))] flex-col gap-2 sm:right-6 sm:top-20" role="status" aria-live="polite">
      {items.map((i) => (
        <div key={i.key} className="glass pointer-events-auto flex items-start gap-2.5 rounded-[12px] px-3.5 py-3 text-sm text-ink shadow-lg [animation:toast-in_0.35s_ease-out]">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[i.tone]}`} />
          <span>{i.text}</span>
        </div>
      ))}
    </div>
  );
}

function LiveDot() {
  const on = useLiveStatus();
  return (
    <span className="hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted sm:flex" title={on ? 'Updates arrive instantly' : 'Reconnecting… (still refreshing every few seconds)'}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-sage shadow-[0_0_8px_2px_rgba(98,211,155,0.6)]' : 'bg-muted'}`} />
      {on ? 'Live' : 'Offline'}
    </span>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  useEffect(() => {
    startLive();
    return stopLive;
  }, [user?.id]);
  const roleLabel = { faculty: 'Faculty', hod: 'Head of Department', student: 'Student' }[user.role];
  return (
    <div className="relative min-h-screen">
      {/* the school campus slowly circles behind the app; a dark wash keeps text readable */}
      <CampusBackdrop time={timeOfDayNow()} drift className="fixed inset-0 -z-20" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,9,7,0.35)_0%,rgba(5,9,7,0.78)_38%,rgba(5,9,7,0.9)_100%)]" />
      <header className="glass sticky top-0 z-10 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right md:block">
              <div className="text-sm font-semibold text-ink">{user.name}</div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-muted">
                {roleLabel}
                {user.className ? ` · ${user.className}` : ''}
              </div>
            </div>
            <LiveDot />
            <InstallButton />
            <NotificationBell />
            <button onClick={logout} className="h-9 rounded-[11px] border border-line bg-white px-3 text-sm text-ink hover:border-brass/60">
              Log out
            </button>
          </div>
        </div>
      </header>
      <LiveToasts role={user.role} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
