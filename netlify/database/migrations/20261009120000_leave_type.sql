-- Full day, morning/afternoon session, or chosen periods
ALTER TABLE leaves ADD COLUMN leave_type TEXT NOT NULL DEFAULT 'full' CHECK (leave_type IN ('full', 'morning', 'afternoon', 'periods'));
