ALTER TABLE atlas.entries ADD COLUMN transcription text CHECK (length(transcription) BETWEEN 1 AND 4096);
