-- "I'm sick today" leaves are flagged urgent so the HOD sees them first
ALTER TABLE leaves ADD COLUMN urgent BOOLEAN NOT NULL DEFAULT FALSE;
