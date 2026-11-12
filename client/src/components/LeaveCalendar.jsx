import { useMemo, useState } from 'react';

const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dayKey = (s) => DAY_KEYS[new Date(`${s}T00:00:00Z`).getUTCDay()];

/**
 * Month calendar for picking a leave date.
 * - dot under days you teach
 * - days you are already on leave are struck through
 * - Sundays and past days are disabled
 */
export default function LeaveCalendar({ today, classes, leaveDates, value, endValue, onChange }) {
  const [ty, tm] = today.split('-').map(Number);
  const [view, setView] = useState({ y: ty, m: tm - 1 });

  const teachDays = useMemo(() => new Set(classes.map((c) => c.day)), [classes]);
  const onLeave = useMemo(() => new Set(leaveDates), [leaveDates]);

  const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay(); // 0 = Sun
  const lead = (first + 6) % 7; // weeks start on Monday
  const daysIn = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];

  const atStart = view.y === ty && view.m === tm - 1;
  const move = (n) => setView(({ y, m }) => {
    const d = new Date(Date.UTC(y, m + n, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" disabled={atStart} onClick={() => move(-1)} className="rounded px-2 py-1 text-ink hover:bg-paper-2 disabled:opacity-25" aria-label="Previous month">‹</button>
        <span className="font-display text-base font-medium text-ink">{MONTHS[view.m]} {view.y}</span>
        <button type="button" onClick={() => move(1)} className="rounded px-2 py-1 text-ink hover:bg-paper-2" aria-label="Next month">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] uppercase tracking-wider text-muted">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-1">{d.slice(0, 2)}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const date = iso(view.y, view.m, d);
          const key = dayKey(date);
          const past = date < today;
          const sunday = key === 'Sun';
          const taken = onLeave.has(date);
          const teaches = teachDays.has(key);
          const selected = value === date || endValue === date;
          const inRange = value && endValue && date > value && date < endValue;
          const disabled = past || sunday || taken;
          return (
            <button
              type="button"
              key={date}
              disabled={disabled}
              onClick={() => onChange(date)}
              title={taken ? 'Already on leave' : sunday ? 'Sunday' : teaches ? 'You have classes' : 'No classes'}
              className={`relative flex h-10 flex-col items-center justify-center rounded text-sm transition
                ${selected ? 'bg-ink text-paper' : inRange && !disabled ? 'bg-brass-soft text-ink' : disabled ? 'text-muted/40' : 'text-ink hover:bg-brass-soft'}
                ${date === today && !selected ? 'ring-1 ring-brass' : ''}`}
            >
              <span className={taken ? 'line-through' : ''}>{d}</span>
              {teaches && !disabled && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${selected ? 'bg-brass' : 'bg-ink/40'}`} />}
              {taken && <span className="absolute bottom-0.5 font-mono text-[8px] uppercase text-clay">leave</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-muted">
        <span className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-ink/40" /> you teach</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm ring-1 ring-brass" /> today</span>
        <span className="text-clay">leave = already applied</span>
      </div>
    </div>
  );
}

export { dayKey };
