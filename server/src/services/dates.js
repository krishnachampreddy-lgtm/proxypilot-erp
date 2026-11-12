// All dates are handled as "YYYY-MM-DD" strings in Indian time (Asia/Kolkata).

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(dateStr) {
  return DAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

export function prettyDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function monthStart(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

export const PERIOD_TIMES = {
  1: '9:00–9:50',
  2: '9:50–10:40',
  3: '11:00–11:50',
  4: '11:50–12:40',
  5: '1:30–2:20',
  6: '2:20–3:10',
};
