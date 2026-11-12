-- School ERP connection: ProxyPilot plugs into the school's own ERP as an extension.

-- the ERP's own id for a teacher or student, so both systems talk about the same person
ALTER TABLE users ADD COLUMN erp_id TEXT UNIQUE;

-- where a leave came from (typed in ProxyPilot, or sent by the ERP) and the ERP's id for it
ALTER TABLE leaves ADD COLUMN source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'erp'));
ALTER TABLE leaves ADD COLUMN erp_ref TEXT;
CREATE INDEX leaves_erp_ref ON leaves (erp_ref);

-- one school per ProxyPilot site: a single settings row
CREATE TABLE erp_connection (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  erp_name TEXT,
  pull_url TEXT,              -- the ERP's API, where ProxyPilot reads teachers, students and the timetable
  pull_key_enc TEXT,          -- the key ProxyPilot uses to call the ERP (encrypted)
  api_key_hash TEXT,          -- sha256 of the key the ERP uses to call ProxyPilot (never stored in plain text)
  api_key_hint TEXT,          -- last 4 characters, so the HOD can tell keys apart
  webhook_url TEXT,           -- where ProxyPilot sends leave and cover updates
  webhook_secret_enc TEXT,    -- signs every update so the ERP knows it is genuine (encrypted)
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync_at TIMESTAMPTZ,
  last_sync JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- every message in or out, for the activity log
CREATE TABLE erp_events (
  id SERIAL PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'failed', 'sending')),
  detail TEXT,
  payload JSONB,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX erp_events_recent ON erp_events (created_at DESC);

-- The demo school ERP that ships with ProxyPilot (stands in for Teachmint, Entab, etc. in demos)
CREATE TABLE demo_erp_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  proxypilot_url TEXT,
  api_key_enc TEXT,           -- the ProxyPilot key this ERP uses when it sends a leave
  webhook_secret_enc TEXT,    -- checks the signature on every update ProxyPilot sends
  erp_key_hash TEXT,          -- what ProxyPilot must send to read this ERP's data
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE demo_erp_inbox (
  id SERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  verified BOOLEAN NOT NULL,
  body JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE demo_erp_leaves (
  id SERIAL PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  teacher_erp_id TEXT NOT NULL,
  date TEXT NOT NULL,
  end_date TEXT,
  session TEXT NOT NULL,
  reason TEXT,
  approved_in_erp BOOLEAN NOT NULL DEFAULT FALSE,
  proxypilot_status TEXT,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
