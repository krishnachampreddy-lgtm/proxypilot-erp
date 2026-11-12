-- Leave needs HOD approval before cover is arranged
ALTER TABLE leaves ADD COLUMN status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'declined'));
ALTER TABLE leaves ADD COLUMN hod_note TEXT;
ALTER TABLE leaves ADD COLUMN decided_at TIMESTAMPTZ;
ALTER TABLE leaves ALTER COLUMN status SET DEFAULT 'pending';
