-- Leaves spanning several days share one group id, so the HOD sees one request
ALTER TABLE leaves ADD COLUMN group_id TEXT;
CREATE INDEX leaves_group ON leaves (group_id);
