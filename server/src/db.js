import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// ---------------------------------------------------------------
// PostgreSQL connection
//  - On Netlify: Netlify Database (auto-provisioned, no password to paste)
//  - Anywhere else: set DATABASE_URL (Neon, Supabase, local Postgres...)
// ---------------------------------------------------------------

let pool;

export async function getPool() {
  if (pool) return pool;
  if (process.env.DATABASE_URL) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  } else {
    const { getDatabase } = await import('@netlify/database');
    pool = getDatabase().pool;
  }
  return pool;
}

export async function q(text, params = []) {
  const p = await getPool();
  const { rows } = await p.query(text, params);
  return rows;
}

// Local dev / external Postgres only: apply the SQL files in netlify/database/migrations.
// On Netlify, the platform applies those migrations automatically on every deploy.
export async function ensureSchema() {
  if (!process.env.DATABASE_URL) return;
  await q('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())');
  const applied = new Set((await q('SELECT name FROM app_migrations')).map((r) => r.name));
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../netlify/database/migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    await q(fs.readFileSync(path.join(dir, file), 'utf8'));
    await q('INSERT INTO app_migrations (name) VALUES ($1)', [file]);
    console.log(`Applied migration ${file}`);
  }
}

// ---------------- Users ----------------

export const Users = {
  byEmail: async (email) => (await q('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]))[0],
  byId: async (id) => (await q('SELECT * FROM users WHERE id = $1', [id]))[0],
  byGoogleSub: async (sub) => (await q('SELECT * FROM users WHERE google_sub = $1', [sub]))[0],
  create: async (u) =>
    (
      await q(
        `INSERT INTO users (name, email, password_hash, role, subjects, class_name, google_sub, avatar, needs_profile)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          u.name, u.email.toLowerCase(), u.passwordHash ?? null, u.role, u.subjects ?? [], u.className ?? null,
          u.googleSub ?? null, u.avatar ?? null, u.needsProfile ?? false,
        ]
      )
    )[0],
  update: async (id, fields) => {
    const keys = Object.keys(fields);
    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    return (await q(`UPDATE users SET ${set} WHERE id = $1 RETURNING *`, [id, ...keys.map((k) => fields[k])]))[0];
  },
  faculty: () => q(`SELECT * FROM users WHERE role = 'faculty' ORDER BY id`),
  count: async () => Number((await q('SELECT COUNT(*)::int AS n FROM users'))[0].n),
  nameMap: async () => Object.fromEntries((await q('SELECT id, name FROM users')).map((u) => [u.id, u.name])),
};

// ---------------- Timetable ----------------

export const Timetable = {
  byFaculty: (fid) =>
    q(
      `SELECT * FROM timetable WHERE faculty_id = $1
       ORDER BY array_position(ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'], day), period`,
      [fid]
    ),
  busyFaculty: async (day, period) =>
    (await q('SELECT DISTINCT faculty_id FROM timetable WHERE day = $1 AND period = $2', [day, period])).map((r) => r.faculty_id),
  facultyOfClass: async (className) =>
    (await q('SELECT DISTINCT faculty_id FROM timetable WHERE class_name = $1', [className])).map((r) => r.faculty_id),
  countFacultyDay: async (day, fid) =>
    Number((await q('SELECT COUNT(*)::int AS n FROM timetable WHERE day = $1 AND faculty_id = $2', [day, fid]))[0].n),
  classDay: (className, day) =>
    q(
      `SELECT t.*, u.name AS faculty_name FROM timetable t JOIN users u ON u.id = t.faculty_id
       WHERE t.class_name = $1 AND t.day = $2 ORDER BY t.period`,
      [className, day]
    ),
};

// ---------------- Leaves ----------------

export const Leaves = {
  // a declined leave does not block applying again for the same day
  exists: async (fid, date) =>
    (await q(`SELECT 1 FROM leaves WHERE faculty_id = $1 AND date = $2 AND status <> 'declined'`, [fid, date])).length > 0,
  create: async (l) =>
    (
      await q(
        `INSERT INTO leaves (faculty_id, date, raw_text, reason, periods, ai_used, status, leave_type, group_id, urgent)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9) RETURNING *`,
        [l.facultyId, l.date, l.rawText, l.reason, l.periods, l.aiUsed, l.leaveType || 'full', l.groupId ?? null, Boolean(l.urgent)]
      )
    )[0],
  byId: async (id) => (await q('SELECT * FROM leaves WHERE id = $1', [id]))[0],
  decide: async (id, status, note) =>
    (await q(`UPDATE leaves SET status = $2, hod_note = $3, decided_at = NOW() WHERE id = $1 RETURNING *`, [id, status, note ?? null]))[0],
  byFaculty: (fid) => q('SELECT * FROM leaves WHERE faculty_id = $1 ORDER BY date DESC, id DESC', [fid]),
  remove: (id) => q(`DELETE FROM leaves WHERE id = $1 AND status = 'pending'`, [id]),
  // every day of the same request (a single-day leave is its own group)
  sameGroup: (leave) =>
    leave.group_id ? q('SELECT * FROM leaves WHERE group_id = $1 ORDER BY date', [leave.group_id]) : Promise.resolve([leave]),
  inMonth: (from, to) =>
    q(
      `SELECT l.*, u.name AS faculty_name FROM leaves l JOIN users u ON u.id = l.faculty_id
       WHERE l.date >= $1 AND l.date <= $2 ORDER BY l.date, u.name`,
      [from, to]
    ),
  // only approved leave makes a teacher unavailable as a substitute
  facultyOnDate: async (date) =>
    (await q(`SELECT DISTINCT faculty_id FROM leaves WHERE date = $1 AND status = 'approved'`, [date])).map((r) => r.faculty_id),
  pending: () =>
    q(
      `SELECT l.*, u.name AS faculty_name, u.subjects AS faculty_subjects FROM leaves l JOIN users u ON u.id = l.faculty_id
       WHERE l.status = 'pending' ORDER BY l.urgent DESC, l.date, l.id`
    ),
  upcoming: (today) =>
    q(
      `SELECT l.*, u.name AS faculty_name FROM leaves l JOIN users u ON u.id = l.faculty_id
       WHERE l.date >= $1 AND l.status = 'approved' ORDER BY l.date`,
      [today]
    ),
};

// ---------------- Proxies ----------------

export const Proxies = {
  create: async (p) =>
    (
      await q(
        `INSERT INTO proxies (leave_id, date, day, period, class_name, subject, current_topic, absent_faculty_id,
                              candidates, offered_to, status, history)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          p.leaveId, p.date, p.day, p.period, p.className, p.subject, p.currentTopic, p.absentFacultyId,
          JSON.stringify(p.candidates), p.offeredTo ?? null, p.status, JSON.stringify(p.history),
        ]
      )
    )[0],
  byId: async (id) => (await q('SELECT * FROM proxies WHERE id = $1', [id]))[0],
  save: (p) =>
    q(
      `UPDATE proxies SET current_index=$2, offered_to=$3, assigned_to=$4, status=$5,
         ai_reason=$6, handover_note=$7, history=$8 WHERE id=$1`,
      [p.id, p.current_index, p.offered_to ?? null, p.assigned_to ?? null, p.status, p.ai_reason, p.handover_note, JSON.stringify(p.history)]
    ),
  where: (sql, params) => q(`SELECT * FROM proxies WHERE ${sql}`, params),
  monthCounts: async (from, to) =>
    Object.fromEntries(
      (
        await q(
          `SELECT assigned_to, COUNT(*)::int AS n FROM proxies
           WHERE status = 'accepted' AND date >= $1 AND ($2::text IS NULL OR date <= $2) AND assigned_to IS NOT NULL
           GROUP BY assigned_to`,
          [from, to ?? null]
        )
      ).map((r) => [r.assigned_to, r.n])
    ),
};

/** Turn proxy rows into the JSON shape the frontend uses (names filled in). */
export async function hydrateProxies(rows) {
  const names = await Users.nameMap();
  const person = (id) => (id ? { _id: id, name: names[id] } : null);
  return rows.map((p) => ({
    _id: p.id,
    leave: p.leave_id,
    date: p.date,
    day: p.day,
    period: p.period,
    className: p.class_name,
    subject: p.subject,
    currentTopic: p.current_topic,
    absentFaculty: person(p.absent_faculty_id),
    offeredTo: person(p.offered_to),
    assignedTo: person(p.assigned_to),
    candidates: (p.candidates || []).map((c) => ({ ...c, faculty: person(c.faculty) })),
    status: p.status,
    aiReason: p.ai_reason,
    handoverNote: p.handover_note,
    history: p.history || [],
  }));
}
