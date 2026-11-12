import { useCallback, useEffect, useRef, useState } from 'react';
import { useLive } from '../live.js';
import api from '../api';
import { useAuth } from '../auth.jsx';

const TONE = { brass: 'bg-brass', sage: 'bg-sage', clay: 'bg-clay' };

const ago = (at) => {
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

// When the bell was last opened, remembered per user on this device
const seenKey = (user) => `pp_seen_${user.email}`;
const readSeen = (user) => {
  try {
    return localStorage.getItem(seenKey(user)) || '';
  } catch {
    return '';
  }
};

export default function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => readSeen(user));
  const box = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications');
      setItems(data.items);
    } catch {
      /* the bell is a convenience; ignore network hiccups */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);
  useLive(() => load());

  // close when tapping outside
  useEffect(() => {
    if (!open) return;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const unread = items.filter((i) => !seen || i.at > seen).length;

  // show the count in the browser tab too
  useEffect(() => {
    const base = 'ProxyPilot — every class, covered';
    document.title = unread ? `(${unread}) ${base}` : base;
  }, [unread]);

  const toggle = () => {
    if (!open && items.length) {
      const newest = items[0].at;
      try {
        localStorage.setItem(seenKey(user), newest);
      } catch {
        /* ignore */
      }
      // keep the dots visible while the panel is open; they clear next time
      setTimeout(() => setSeen(newest), 4000);
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={box} className="relative">
      <button
        onClick={toggle}
        aria-label={unread ? `${unread} new notifications` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-[11px] border border-line bg-white text-ink hover:border-ink/40"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-clay px-1 font-mono text-[10px] font-semibold text-paper ring-2 ring-paper">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-30 rounded-[14px] border border-line bg-[#0b1511]/95 backdrop-blur-xl shadow-[0_24px_48px_-20px_rgba(0,0,0,0.8)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="font-display text-base font-medium text-ink">Notifications</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Last 2 weeks</span>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">You’re all caught up.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line/70 overflow-y-auto">
              {items.map((i) => {
                const isNew = !seen || i.at > seen;
                return (
                  <li key={i.id} className={`flex gap-3 px-4 py-3 ${isNew ? 'bg-brass-soft/30' : ''}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[i.tone] || 'bg-ink'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-ink">{i.title}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted">{ago(i.at)}</span>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-snug text-ink/75">{i.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
