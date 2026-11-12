import { q } from '../db.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SECTIONS = ['CSE-4A', 'CSE-4B', 'CSE-4C'];
const TOPIC = 'Unit 2 — continue from last class';

/**
 * New faculty (signed up with Gmail) start with no timetable, so leave would find nothing to cover.
 * Give them a starter week: 3 periods a day in their own section, so nothing clashes with the demo classes.
 * Runs only when the teacher has no timetable rows (also after "Reset demo data").
 */
export async function ensureStarterTimetable(user) {
  if (!user || user.role !== 'faculty') return;
  const [{ n }] = await q('SELECT COUNT(*)::int AS n FROM timetable WHERE faculty_id = $1', [user.id]);
  if (n > 0) return;

  const subjects = user.subjects?.length ? user.subjects : ['General Studies'];
  const section = SECTIONS[user.id % SECTIONS.length];
  const rows = [];
  DAYS.forEach((day, d) => {
    // 3 periods a day, spread out and shifted per teacher
    [1, 3, 5].forEach((base, k) => {
      const period = ((base - 1 + d + user.id) % 6) + 1;
      rows.push([day, period, section, subjects[(d + k) % subjects.length], TOPIC, user.id]);
    });
  });
  const params = rows.flat();
  const values = rows.map((_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`).join(',');
  await q(`INSERT INTO timetable (day, period, class_name, subject, current_topic, faculty_id) VALUES ${values}`, params);
}
