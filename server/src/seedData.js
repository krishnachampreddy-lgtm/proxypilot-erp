import bcrypt from 'bcryptjs';
import { q } from './db.js';
import { todayIST, monthStart, addDays, weekday } from './services/dates.js';

// Fake but realistic demo data. Every account's password is: demo123
export const DEMO_PASSWORD = 'demo123';

// The five subjects ProxyPilot supports
export const SUBJECTS = ['English', 'DBMS', 'Python', 'DSA', 'Aptitude'];

const FACULTY = [
  { name: 'Dr. Anita Mehta', email: 'mehta@college.edu', subjects: ['DBMS', 'Python'] },
  { name: 'Prof. Ravi Rao', email: 'rao@college.edu', subjects: ['DBMS', 'DSA'] },
  { name: 'Dr. Sunil Iyer', email: 'iyer@college.edu', subjects: ['English', 'Aptitude'] },
  { name: 'Prof. Kavya Nair', email: 'nair@college.edu', subjects: ['DSA', 'Python'] },
  { name: 'Dr. Arjun Singh', email: 'singh@college.edu', subjects: ['Aptitude', 'DSA'] },
  { name: 'Prof. Meera Joshi', email: 'joshi@college.edu', subjects: ['English'] },
  { name: 'Prof. Farhan Ali', email: 'ali@college.edu', subjects: ['Python', 'DSA'] },
  { name: 'Dr. Priya Das', email: 'das@college.edu', subjects: ['DBMS', 'Aptitude'] },
];

const CLASSES = [
  { name: 'CSE-2A', subjects: SUBJECTS },
  { name: 'CSE-2B', subjects: SUBJECTS },
  { name: 'CSE-3A', subjects: SUBJECTS },
  { name: 'CSE-3B', subjects: SUBJECTS },
];

const TOPICS = {
  English: 'Business letters and email etiquette',
  DBMS: 'Normalization — 2NF and 3NF',
  Python: 'Functions, *args and **kwargs',
  DSA: 'Binary search trees — deletion',
  Aptitude: 'Time and work problems',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_PER_DAY = 4;

/**
 * The demo school as a plain list (no database ids): teachers, students and a clash-free weekly timetable.
 * The demo school ERP serves exactly this data, so syncing from it gives ProxyPilot the same school.
 */
export function buildSchool() {
  const faculty = FACULTY.map((f, i) => ({ ...f, erpId: `T${String(i + 1).padStart(2, '0')}` }));
  const students = [{ erpId: 'S0001', name: 'Aarav Sharma', email: 'aarav@college.edu', className: 'CSE-2A' }];
  const slots = [];
  const weekly = new Map(faculty.map((f) => [f.email, 0]));
  DAYS.forEach((day, d) => {
    const daily = new Map(faculty.map((f) => [f.email, 0]));
    for (let period = 1; period <= 6; period++) {
      const busy = new Set();
      CLASSES.forEach((cls, c) => {
        const start = (period - 1 + d * 2 + c) % cls.subjects.length;
        const order = [...cls.subjects.slice(start), ...cls.subjects.slice(0, start)];
        for (const subject of order) {
          const options = faculty
            .filter((f) => f.subjects.includes(subject) && !busy.has(f.email) && daily.get(f.email) < MAX_PER_DAY)
            .sort((a, b) => daily.get(a.email) - daily.get(b.email) || weekly.get(a.email) - weekly.get(b.email));
          const f = options[0];
          if (!f) continue;
          busy.add(f.email);
          daily.set(f.email, daily.get(f.email) + 1);
          weekly.set(f.email, weekly.get(f.email) + 1);
          slots.push({ day, period, className: cls.name, subject, topic: TOPICS[subject], email: f.email, teacherErpId: f.erpId });
          break;
        }
      });
    }
  });
  return { faculty, students, slots };
}

export async function seedDatabase() {
  // Clear demo data only — real accounts (Google / Gmail / sign-up) are kept
  await q('DELETE FROM proxies');
  await q('DELETE FROM leaves');
  await q('DELETE FROM timetable');
  await q(`DELETE FROM users WHERE email LIKE '%@college.edu'`);
  // the ERP activity log and the demo ERP's own records start fresh too (the connection itself is kept)
  await q('DELETE FROM erp_events');
  await q('DELETE FROM demo_erp_inbox');
  await q('DELETE FROM demo_erp_leaves');
  await q('UPDATE erp_connection SET last_sync_at = NULL, last_sync = NULL');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const insertUser = async (u) =>
    (
      await q(
        `INSERT INTO users (name, email, password_hash, role, subjects, class_name)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, subjects`,
        [u.name, u.email, passwordHash, u.role, u.subjects || [], u.className || null]
      )
    )[0];

  const school = buildSchool();
  const faculty = [];
  for (const f of school.faculty) faculty.push(await insertUser({ name: f.name, email: f.email, subjects: f.subjects, role: 'faculty' }));
  await insertUser({ name: 'Rahul Attuluri (HOD)', email: 'hod@college.edu', role: 'hod' });
  for (const s of school.students) await insertUser({ name: s.name, email: s.email, role: 'student', className: s.className });

  // the weekly timetable, in the shape the history builder below expects: [day, period, class, subject, topic, teacher id]
  const idByEmail = new Map(faculty.map((f) => [f.email, f.id]));
  const slots = school.slots.map((x) => [x.day, x.period, x.className, x.subject, x.topic, idByEmail.get(x.email)]);
  const params = slots.flat();
  const values = slots.map((_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`).join(',');
  await q(`INSERT INTO timetable (day, period, class_name, subject, current_topic, faculty_id) VALUES ${values}`, params);

  // Six months of history: past leaves, who covered each class and how fast,
  // so the HOD's insights and the fairness chart have a real story to tell
  // (Dr. Iyer has been covering far more than anyone else this month).
  const pastCount = await seedHistory(faculty, slots);

  // One leave already waiting for the HOD, so the dashboard is never empty
  const rao = faculty.find((x) => x.email === 'rao@college.edu');
  let sampleDate = addDays(todayIST(), 2);
  while (weekday(sampleDate) === 'Sun') sampleDate = addDays(sampleDate, 1);
  const raoPeriods = slots.filter((s) => s[5] === rao.id && s[0] === weekday(sampleDate)).map((s) => s[1]).sort((a, b) => a - b);
  if (raoPeriods.length) {
    await q(
      `INSERT INTO leaves (faculty_id, date, raw_text, reason, periods, ai_used, status, leave_type)
       VALUES ($1,$2,$3,$4,$5,false,'pending','full')`,
      [rao.id, sampleDate, 'Family function out of town, need full day leave', 'Family function', raoPeriods]
    );
  }

  console.log(`Seeded ${faculty.length} faculty, ${slots.length} timetable slots, ${pastCount} past proxies`);
}

// a small deterministic random generator, so every reset gives the same demo
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REASONS = [
  ['Fever, doctor advised rest', 'Sick'],
  ['Family function out of town', 'Family function'],
  ['Attending a faculty development programme', 'FDP'],
  ['Child unwell, need to stay home', 'Family emergency'],
  ['Exam duty at the university', 'University duty'],
  ['Dental appointment in the morning', 'Medical appointment'],
  ['Conference paper presentation', 'Conference'],
];

async function seedHistory(faculty, slots) {
  const rng = makeRng(2026);
  const today = todayIST();
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const byEmail = (e) => faculty.find((f) => f.email === e);
  // who covers this month's classes (the overload story), in order
  const thisMonthCover = ['iyer', 'iyer', 'joshi', 'iyer', 'nair', 'rao', 'iyer', 'joshi'].map((n) => byEmail(`${n}@college.edu`));
  let created = 0;

  for (let back = 5; back >= 0; back--) {
    const d = new Date(`${monthStart(today)}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - back);
    const month = d.toISOString().slice(0, 7);
    const wanted = back === 0 ? 3 : 3 + Math.floor(rng() * 3);
    const usedTeachers = new Set();
    let coverIdx = 0;
    for (let k = 0; k < wanted * 4 && usedTeachers.size < wanted; k++) {
      const day = String(2 + Math.floor(rng() * 26)).padStart(2, '0');
      const date = `${month}-${day}`;
      if (date >= today || weekday(date) === 'Sun') continue;
      const teacher = pick(faculty.filter((f) => f.email !== 'mehta@college.edu' || back > 0));
      if (usedTeachers.has(teacher.id)) continue;
      // this month only teachers who aren't in the cover story take leave
      if (back === 0 && thisMonthCover.some((c) => c.id === teacher.id)) continue;
      usedTeachers.add(teacher.id);
      const dayName = weekday(date);
      const mySlots = slots.filter((x) => x[5] === teacher.id && x[0] === dayName).sort((a, b) => a[1] - b[1]);
      if (!mySlots.length) continue;
      const kind = rng() < 0.65 ? 'full' : rng() < 0.5 ? 'morning' : 'afternoon';
      let chosen = mySlots.filter((x) => kind === 'full' || (kind === 'morning' ? x[1] <= 4 : x[1] >= 5));
      if (back === 0) chosen = chosen.slice(0, Math.max(0, thisMonthCover.length - coverIdx));
      if (!chosen.length) continue;
      const declined = back > 0 && rng() < 0.1;
      const [raw, reason] = pick(REASONS);
      const appliedAt = new Date(`${date}T07:${String(5 + Math.floor(rng() * 40)).padStart(2, '0')}:00+05:30`);
      appliedAt.setUTCDate(appliedAt.getUTCDate() - (rng() < 0.4 ? 0 : 1 + Math.floor(rng() * 3)));
      const [leave] = await q(
        `INSERT INTO leaves (faculty_id, date, raw_text, reason, periods, ai_used, status, leave_type, hod_note, created_at, decided_at)
         VALUES ($1,$2,$3,$4,$5,false,$6,$7,$8,$9,$10) RETURNING id`,
        [teacher.id, date, raw, reason, chosen.map((x) => x[1]), declined ? 'declined' : 'approved', kind,
          declined ? 'Internal exams that week — please reschedule.' : null, appliedAt, new Date(appliedAt.getTime() + (10 + rng() * 50) * 60000)]
      );
      if (declined) continue;

      for (const [, period, className, subject, topic] of chosen) {
        const busy = new Set(slots.filter((x) => x[0] === dayName && x[1] === period).map((x) => x[5]));
        const free = faculty.filter((f) => f.id !== teacher.id && !busy.has(f.id));
        const same = free.filter((f) => f.subjects.includes(subject));
        const other = free.filter((f) => !f.subjects.includes(subject));
        let order = [...same, ...other];
        let taker = back === 0 ? thisMonthCover[coverIdx++] : null;
        if (taker) order = [taker, ...order.filter((f) => f.id !== taker.id)];
        if (!order.length) continue;
        // sometimes the first teacher says no or doesn't answer, and it moves on
        const skips = order.length > 1 && rng() < (taker ? 0.35 : 0.22) ? 1 : 0;
        const auto = skips && rng() < 0.45;
        if (taker && skips) order = [order.find((f) => f.id !== taker.id), taker, ...order.filter((f) => f.id !== taker.id).slice(1)];
        taker ||= order[Math.min(skips, order.length - 1)];
        let t = new Date(`${date}T07:35:00+05:30`).getTime() - (rng() < 0.5 ? 86400000 : 0) + rng() * 3600000;
        const history = [];
        for (let i = 0; i < skips && i < order.length - 1; i++) {
          history.push({ faculty: order[i].id, action: 'offered', at: new Date(t).toISOString() });
          t += (auto ? 15 : 2 + rng() * 9) * 60000;
          history.push({ faculty: order[i].id, action: auto ? 'no-reply' : 'declined', at: new Date(t).toISOString(), ...(auto ? { auto: true } : {}) });
        }
        history.push({ faculty: taker.id, action: 'offered', at: new Date(t).toISOString() });
        t += (1 + rng() * 14) * 60000;
        history.push({ faculty: taker.id, action: 'accepted', at: new Date(t).toISOString() });
        const candidates = order.slice(0, 5).map((f) => ({ faculty: f.id, score: 0, factors: [], sameSubject: f.subjects.includes(subject) }));
        await q(
          `INSERT INTO proxies (leave_id, date, day, period, class_name, subject, current_topic, absent_faculty_id, candidates,
                                current_index, offered_to, assigned_to, status, history, handover_note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,'accepted',$12,$13)`,
          [leave.id, date, dayName, period, className, subject, topic, teacher.id, JSON.stringify(candidates),
            Math.max(0, order.indexOf(taker)), taker.id, JSON.stringify(history), `Continue ${topic.toLowerCase()} from the last class.`]
        );
        created++;
      }
    }
  }
  return created;
}

/** Load demo data the first time the app runs on an empty database. */
let seeding;
export function seedIfEmpty() {
  seeding ||= (async () => {
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM users WHERE email LIKE '%@college.edu'`);
    if (n === 0) await seedDatabase();
  })().catch((e) => {
    seeding = null;
    throw e;
  });
  return seeding;
}
