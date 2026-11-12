import { useState } from 'react';

/*
  HOD insights: a row of headline numbers, then two small bar charts.
  Single-series bars in chalk, the bar that matters (this month / the busiest day)
  in the accent colour; hover any bar for its numbers.
*/

function Tile({ label, value, unit, note }) {
  return (
    <div className="rounded-[12px] border border-line bg-white/90 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-4xl tabular-nums text-ink">{value ?? '—'}</span>
        {value != null && unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {note && <div className="mt-0.5 text-xs text-muted">{note}</div>}
    </div>
  );
}

/** vertical bars with a hover tooltip; `accent` is the index drawn in the accent colour */
function Bars({ data, accent, height = 132, title }) {
  const [hover, setHover] = useState(null);
  const top = Math.max(1, ...data.map((d) => d.value));
  const max = top * 1.18; // headroom so the value label never touches the title
  return (
    <figure>
      <figcaption className="mb-3 text-sm font-semibold text-ink">{title}</figcaption>
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {/* recessive gridline at the top value */}
        <div className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${(top / max) * 100}%` }} />
        <span className="absolute right-0 font-mono text-[10px] text-muted" style={{ bottom: `calc(${(top / max) * 100}% + 2px)` }}>{top}</span>
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-line">
          {data.map((d, i) => (
            <div
              key={d.label}
              className="relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${d.label}: ${d.tip}`}
            >
              <div
                className={`w-[62%] max-w-10 rounded-t-[4px] transition-colors ${i === accent ? 'bg-brass' : hover === i ? 'bg-ink-3/80' : 'bg-ink-3/45'}`}
                style={{ height: `${Math.max(d.value ? 3 : 0, (d.value / max) * 100)}%` }}
              />
              {i === accent && d.value > 0 && <span className="absolute font-mono text-[11px] text-ink" style={{ bottom: `calc(${(d.value / max) * 100}% + 4px)` }}>{d.value}</span>}
            </div>
          ))}
        </div>
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-line bg-paper px-2.5 py-1.5 text-xs text-ink shadow-lg"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%`, bottom: `calc(${(data[hover].value / max) * 100}% + 22px)` }}
          >
            <div className="font-semibold">{data[hover].label}</div>
            <div className="text-muted">{data[hover].tip}</div>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        {data.map((d, i) => (
          <span key={d.label} className={`flex-1 text-center font-mono text-[10px] uppercase tracking-wide ${i === accent ? 'text-ink' : 'text-muted'}`}>
            {d.label}
          </span>
        ))}
      </div>
      {/* the same numbers as a table, for screen readers */}
      <table className="sr-only">
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th>{d.label}</th>
              <td>{d.tip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default function Insights({ data }) {
  if (!data) return null;
  const months = data.perMonth.map((m) => ({ label: m.label, value: m.covered, tip: `${m.covered} classes covered · ${m.leaves} leave days${m.uncovered ? ` · ${m.uncovered} not covered` : ''}` }));
  const busiest = data.byDay.reduce((b, d, i, a) => (d.leaves > a[b].leaves ? i : b), 0);
  const days = data.byDay.map((d) => ({ label: d.day, value: d.leaves, tip: `${d.leaves} leave${d.leaves === 1 ? '' : 's'} in the last 90 days` }));
  const fairNote = data.fairness >= 80 ? 'proxies are shared evenly' : data.fairness >= 55 ? 'a few teachers carry more' : 'one or two teachers carry most';
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl text-ink">Insights</h2>
          <p className="text-sm text-muted">How cover is working this month, and over the last six.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Classes covered" value={data.coverage} unit="%" note={`${data.classesCovered} classes this month`} />
        <Tile label="Time to find cover" value={data.medianMinutesToCover} unit="min" note="median, request to yes" />
        <Tile label="Same-subject cover" value={data.sameSubjectRate} unit="%" note="taught by a subject teacher" />
        <Tile label="Fairness" value={data.fairness} unit="/100" note={fairNote} />
        <Tile label="Passed on" value={data.passedOn} note={`${data.autoPassed} automatically, no reply`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[12px] border border-line bg-white/90 p-4">
          <Bars title="Classes covered each month" data={months} accent={months.length - 1} />
        </div>
        <div className="rounded-[12px] border border-line bg-white/90 p-4">
          <Bars title={`Leaves by weekday — ${data.byDay[busiest].leaves ? `${data.byDay[busiest].day} is the busiest` : 'last 90 days'}`} data={days} accent={data.byDay[busiest].leaves ? busiest : -1} />
        </div>
      </div>
    </section>
  );
}
