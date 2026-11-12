import { useCallback, useEffect, useState } from 'react';
import { useLive } from '../live.js';
import api, { errorText } from '../api';
import { Card, ErrorBox } from '../components/ui.jsx';

const CHANGE = {
  substitute: 'bg-sage-soft text-sage border-sage-soft',
  pending: 'bg-brass-soft text-brass-2 border-brass/40',
  free: 'bg-clay-soft text-clay border-clay/40',
};

export default function Student() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api.get('/student/schedule').then((r) => setData(r.data)).catch((e) => setError(errorText(e))), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // backup; live events refresh at once
    return () => clearInterval(t);
  }, [load]);
  useLive(() => load());

  if (!data) return <p className="text-muted">{error || 'Loading…'}</p>;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-medium tracking-tight text-ink">Class {data.className} timetable</h1>
      <ErrorBox text={error} />
      <div className="grid gap-6 md:grid-cols-2">
        {data.days.map((d) => (
          <Card key={d.date} title={d.prettyDate}>
            {d.periods.length === 0 ? (
              <p className="text-sm text-muted">No classes.</p>
            ) : (
              <ul className="space-y-2">
                {d.periods.map((p) => (
                  <li key={p.period} className={`rounded-lg border px-3 py-2 text-sm ${p.change ? CHANGE[p.change.type] : 'border-line'}`}>
                    <div className="flex justify-between">
                      <span className="font-semibold">P{p.period} · {p.subject}</span>
                      <span className="text-xs opacity-70">{p.time}</span>
                    </div>
                    <div className={p.change ? 'line-through opacity-60' : 'text-ink/80'}>{p.teacher}</div>
                    {p.change && <div className="font-medium">{p.change.text}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
