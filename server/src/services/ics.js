import { PERIOD_TIMES } from './dates.js';

/*
  Calendar file (.ics) for a teacher's substitute lectures, so they show up in
  Google Calendar, Outlook or the phone's calendar with a reminder.
  Times are written in UTC (India is UTC+5:30), which every calendar app reads.
*/

const pad = (n) => String(n).padStart(2, '0');

function istToUtcStamp(date, hhmm) {
  let [h, m] = hhmm.split(':').map(Number);
  if (h < 8) h += 12; // "1:30" in the timetable is 1:30 pm
  const d = new Date(`${date}T${pad(h)}:${pad(m)}:00+05:30`);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

const esc = (t) => String(t ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

// lines longer than 75 bytes are folded, as the format requires
const fold = (line) => {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
};

export function coverCalendar(proxies, { host = 'proxypilot' } = {}) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ProxyPilot//Cover lectures//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:ProxyPilot cover lectures'];
  for (const p of proxies) {
    const t = PERIOD_TIMES[p.period];
    if (!t) continue;
    const [start, end] = t.split('–');
    const note = [p.handoverNote, p.currentTopic && `Topic: ${p.currentTopic}`, p.absentFaculty?.name && `Covering for ${p.absentFaculty.name}`].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:proxy-${p._id}@${host}`,
      `DTSTAMP:${now}`,
      `DTSTART:${istToUtcStamp(p.date, start)}`,
      `DTEND:${istToUtcStamp(p.date, end)}`,
      fold(`SUMMARY:${esc(`Cover: ${p.className} · ${p.subject} (P${p.period})`)}`),
      fold(`DESCRIPTION:${esc(note)}`),
      `LOCATION:${esc(p.className)}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT10M',
      'ACTION:DISPLAY',
      fold(`DESCRIPTION:${esc(`Cover lecture in 10 minutes: ${p.className}`)}`),
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
