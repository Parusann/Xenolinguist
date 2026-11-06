ALTER TABLE atlas.reference_entries ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
