/*
  The school day timetable, shared by the 3D campus and the page around it
  (this file has no 3D code, so the page can use it without loading three.js).

  A real school day: the gate opens, students arrive, the assembly bell, assembly, eight
  40-minute periods with a bell between each (the teachers change rooms), a short break after
  the third period, lunch after the fifth, home time, after-school games and the staff meeting,
  then the teachers leave and the gate is locked.

  `speed` is campus minutes per real second. Busy moments play close to real time; lessons
  fast-forward, slowing right down for the minute or two either side of each period bell so the
  teachers can be seen leaving one class and walking into the next. A whole day takes about
  sixteen minutes on screen.
*/

const hm = (h, m = 0) => h * 60 + m;

/** every period: [start, end] in minutes after midnight */
export const PERIODS = [
  [hm(8, 35), hm(9, 15)],
  [hm(9, 15), hm(9, 55)],
  [hm(9, 55), hm(10, 35)],
  [hm(10, 50), hm(11, 30)],
  [hm(11, 30), hm(12, 10)],
  [hm(12, 50), hm(13, 30)],
  [hm(13, 30), hm(14, 10)],
  [hm(14, 10), hm(14, 50)],
];

/** the fixed moments of the day */
export const TIMES = {
  gateOpen: hm(7, 15),
  assemblyBell: hm(7, 55),
  assembly: hm(8, 5),
  toClass: hm(8, 25),
  breakStart: hm(10, 35),
  breakEnd: hm(10, 50),
  lunchStart: hm(12, 10),
  lunchWarn: hm(12, 45), // "lunch is over": everyone heads back up for period 6
  lunchEnd: hm(12, 50),
  home: hm(14, 50),
  busesBoard: hm(14, 50.5),
  busesLeave: hm(15, 8),
  after: hm(15, 40), // after-school games, the staff meeting
  meetingEnd: hm(16, 30),
  evening: hm(16, 40),
  teachersLeave: hm(16, 44),
  gateClose: hm(17, 35),
};

export const PHASES = [
  { id: 'arrival', label: 'Morning arrival', from: hm(7, 15), to: TIMES.assemblyBell, speed: 0.3, now: 'Friends walk in together with their bags, go up to their classrooms and sit down' },
  { id: 'gather', label: 'Assembly bell', from: TIMES.assemblyBell, to: TIMES.assembly, speed: 0.07, now: 'Every class comes down and lines up in the courtyard' },
  { id: 'assembly', label: 'Assembly', from: TIMES.assembly, to: TIMES.toClass, speed: 0.6, now: 'Prayer, pledge and the anthem — every class in its lines, its class teacher beside it' },
  { id: 'toclass', label: 'Back to class', from: TIMES.toClass, to: PERIODS[0][0], speed: 0.075, now: 'The lines break up from the back and go up to their classrooms' },
  { id: 'classes', label: 'Lessons', from: PERIODS[0][0], to: TIMES.breakStart, speed: 4, now: 'A teacher in every classroom — explaining, writing on the board · teachers change rooms at each bell' },
  { id: 'break', label: 'Short break', from: TIMES.breakStart, to: TIMES.breakEnd, speed: 0.3, now: 'Fifteen minutes out in the courtyard · teachers on duty' },
  { id: 'classesB', label: 'Lessons', from: TIMES.breakEnd, to: TIMES.lunchStart, speed: 4, now: 'Periods 4 and 5 · a PE class on the track · readers in the library' },
  { id: 'lunch', label: 'Lunch', from: TIMES.lunchStart, to: TIMES.lunchEnd, speed: 0.5, now: 'Friends eat and chat in little groups · basketball on the court · teachers on duty' },
  { id: 'classes2', label: 'Lessons', from: TIMES.lunchEnd, to: TIMES.home, speed: 4, now: 'Afternoon periods · football in PE · a substitute covers any teacher on leave' },
  { id: 'home', label: 'Home time', from: TIMES.home, to: TIMES.after, speed: 0.3, now: 'Floor by floor the classes come down — buses, autos and the walk home' },
  { id: 'after', label: 'After school', from: TIMES.after, to: TIMES.evening, speed: 0.8, now: 'Games practice on the grounds · the staff meeting' },
  { id: 'evening', label: 'Evening', from: TIMES.evening, to: hm(17, 50), speed: 0.9, now: 'Teachers drive home · the classrooms go dark · the gate is locked at 5:35' },
];
for (const p of PHASES) {
  p.short = { arrival: 'Arrival', gather: 'Bell', assembly: 'Assembly', toclass: 'To class', classes: 'P1–3', break: 'Break', classesB: 'P4–5', lunch: 'Lunch', classes2: 'P6–8', home: 'Home', after: 'Games', evening: 'Evening' }[p.id];
  p.jump = p.from + (p.id === 'gather' || p.id === 'lunch' || p.id === 'home' ? -0.6 : 0.1);
}

/** is this part of the day a block of lessons? */
export const isLessons = (id) => id === 'classes' || id === 'classesB' || id === 'classes2';

export const DAY_START = hm(7, 15);
export const DAY_END = hm(17, 50);
export const phaseAt = (m) => PHASES.find((p) => m >= p.from && m < p.to) || PHASES[PHASES.length - 1];

/** which period it is (1-8), or 0 outside lessons */
export function periodAt(m) {
  const i = PERIODS.findIndex(([a, b]) => m >= a && m < b);
  return i + 1;
}
/** the bells between back-to-back periods (the teachers change rooms) */
export const CHANGEOVERS = PERIODS.slice(0, -1).map((p) => p[1]).filter((t, i) => PERIODS[i + 1][0] === t);

/**
 * how fast the campus clock runs at this moment: the part of the day's speed, slowed right down
 * for the changeover either side of a period bell
 */
export function speedAt(m) {
  const p = phaseAt(m);
  if (!isLessons(p.id)) return p.speed;
  for (const t of CHANGEOVERS) {
    if (m > t - 0.6 && m < t + 2.6) return 0.12; // the bell: one teacher walks out, the next walks in
  }
  // and a gentle start and end to each block, so the first and last minutes aren't a blur
  if (m < p.from + 1.5 || m > p.to - 1) return 0.2;
  return p.speed;
}

/** how long each part lasts on screen, in seconds */
const SECONDS = new Map();
export function screenSeconds(p) {
  if (!SECONDS.has(p.id)) {
    let s = 0;
    for (let m = p.from; m < p.to; m += 0.25) s += 0.25 / speedAt(m + 0.125);
    SECONDS.set(p.id, s);
  }
  return SECONDS.get(p.id);
}

/** 0..1 through the day as the viewer sees it (busy parts take more of the strip) */
export function dayProgress(m) {
  const total = PHASES.reduce((s, p) => s + screenSeconds(p), 0);
  let acc = 0;
  for (const p of PHASES) {
    if (m < p.to) {
      let s = 0;
      for (let t = p.from; t < Math.max(p.from, m); t += 0.25) s += Math.min(0.25, m - t) / speedAt(t + 0.125);
      return Math.max(0, acc + s) / total;
    }
    acc += screenSeconds(p);
  }
  return 1;
}

export function clockLabel(m) {
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`;
}

export function phaseLabel(m) {
  const p = phaseAt(m);
  if (isLessons(p.id)) return `Period ${Math.max(1, periodAt(m) || (m < PERIODS[0][0] ? 1 : 8))}`;
  return p.label;
}
