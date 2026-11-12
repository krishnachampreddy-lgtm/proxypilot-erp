-- ProxyPilot schema

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('faculty', 'hod', 'student')),
  department TEXT NOT NULL DEFAULT 'CSE',
  subjects TEXT[] NOT NULL DEFAULT '{}',
  class_name TEXT
);

CREATE TABLE timetable (
  id SERIAL PRIMARY KEY,
  day TEXT NOT NULL,
  period INT NOT NULL CHECK (period BETWEEN 1 AND 6),
  class_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  current_topic TEXT,
  faculty_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX timetable_slot ON timetable (day, period);

CREATE TABLE leaves (
  id SERIAL PRIMARY KEY,
  faculty_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  reason TEXT,
  periods INT[] NOT NULL DEFAULT '{}',
  ai_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE proxies (
  id SERIAL PRIMARY KEY,
  leave_id INT REFERENCES leaves(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  day TEXT,
  period INT,
  class_name TEXT,
  subject TEXT,
  current_topic TEXT,
  absent_faculty_id INT REFERENCES users(id) ON DELETE CASCADE,
  candidates JSONB NOT NULL DEFAULT '[]',
  current_index INT NOT NULL DEFAULT 0,
  offered_to INT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to INT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'uncovered')),
  ai_reason TEXT,
  handover_note TEXT,
  history JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX proxies_date ON proxies (date, period);
