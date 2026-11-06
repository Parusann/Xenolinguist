ALTER TABLE atlas.jobs ADD CONSTRAINT report_size_limit CHECK (report IS NULL OR octet_length(report::text) <= 4194304);
GRANT UPDATE (status,finished_at,lease_token,lease_until) ON atlas.jobs TO atlas_app;
CREATE POLICY worker_inventory ON atlas.objects FOR SELECT TO atlas_worker USING (true);
