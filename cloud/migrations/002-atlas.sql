CREATE TABLE atlas.datasets (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES auth."user"(id),
    title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    language_kind text NOT NULL CHECK (language_kind IN ('known', 'unknown', 'conlang', 'synthetic')),
    glottocode text CHECK (glottocode ~ '^[a-z]{4}[0-9]{4}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, owner_id)
);

CREATE TABLE atlas.objects (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES auth."user"(id),
    storage_root text NOT NULL DEFAULT 'primary' CHECK (storage_root = 'primary'),
    sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 5242880),
    content_type text NOT NULL CHECK (content_type IN ('text/csv', 'application/json', 'text/plain')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, owner_id)
);

CREATE TABLE atlas.dataset_versions (
    id uuid PRIMARY KEY,
    dataset_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    revision integer NOT NULL CHECK (revision > 0),
    object_id uuid NOT NULL,
    import_format text NOT NULL CHECK (import_format IN ('csv', 'json', 'text')),
    row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 5000),
    rights jsonb NOT NULL,
    features jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (dataset_id, revision),
    UNIQUE (id, owner_id),
    FOREIGN KEY (dataset_id, owner_id) REFERENCES atlas.datasets(id, owner_id) ON DELETE CASCADE,
    FOREIGN KEY (object_id, owner_id) REFERENCES atlas.objects(id, owner_id)
);

CREATE TABLE atlas.entries (
    version_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    ordinal integer NOT NULL CHECK (ordinal >= 0),
    entry_id text NOT NULL CHECK (length(entry_id) BETWEEN 1 AND 80),
    form text NOT NULL CHECK (length(form) BETWEEN 1 AND 4096),
    original_form text NOT NULL CHECK (length(original_form) BETWEEN 1 AND 4096),
    meaning text CHECK (length(meaning) <= 4096),
    annotations text CHECK (length(annotations) <= 4096),
    PRIMARY KEY (version_id, entry_id),
    FOREIGN KEY (version_id, owner_id) REFERENCES atlas.dataset_versions(id, owner_id) ON DELETE CASCADE
);
CREATE INDEX entries_version_order ON atlas.entries(version_id, ordinal);

CREATE TABLE atlas.upload_requests (
    owner_id uuid NOT NULL REFERENCES auth."user"(id),
    key uuid NOT NULL,
    request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
    version_id uuid NOT NULL,
    PRIMARY KEY (owner_id, key),
    FOREIGN KEY (version_id, owner_id) REFERENCES atlas.dataset_versions(id, owner_id) ON DELETE CASCADE
);

CREATE TABLE atlas.consents (
    dataset_id uuid PRIMARY KEY,
    owner_id uuid NOT NULL,
    allow_comparison boolean NOT NULL DEFAULT false,
    allow_publication boolean NOT NULL DEFAULT false,
    allow_training boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (dataset_id, owner_id) REFERENCES atlas.datasets(id, owner_id) ON DELETE CASCADE
);

CREATE TABLE atlas.reference_sources (
    id text PRIMARY KEY,
    version text NOT NULL,
    sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    url text NOT NULL,
    license text NOT NULL,
    attribution text NOT NULL,
    manifest jsonb NOT NULL
);
CREATE TABLE atlas.reference_languages (
    source_id text NOT NULL REFERENCES atlas.reference_sources(id),
    id text NOT NULL,
    name text NOT NULL,
    metadata jsonb NOT NULL,
    PRIMARY KEY (source_id, id)
);
CREATE TABLE atlas.reference_entries (
    source_id text NOT NULL,
    language_id text NOT NULL,
    id text NOT NULL,
    concept_id text NOT NULL,
    meaning text NOT NULL,
    form text NOT NULL,
    PRIMARY KEY (source_id, id),
    FOREIGN KEY (source_id, language_id) REFERENCES atlas.reference_languages(source_id, id)
);
CREATE INDEX reference_concepts ON atlas.reference_entries(meaning, language_id);

CREATE TABLE atlas.jobs (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL,
    version_id uuid NOT NULL,
    key uuid NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'complete', 'failed', 'cancelled')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
    lease_token uuid,
    lease_until timestamptz,
    error_code text CHECK (error_code IN ('timeout', 'input-unavailable', 'processing-error', 'attempt-limit')),
    report jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    UNIQUE (owner_id, key),
    FOREIGN KEY (version_id, owner_id) REFERENCES atlas.dataset_versions(id, owner_id) ON DELETE CASCADE,
    CHECK ((status = 'complete') = (report IS NOT NULL))
);
CREATE INDEX queue_jobs ON atlas.jobs(status, created_at) WHERE status IN ('queued', 'running');
CREATE INDEX owner_jobs ON atlas.jobs(owner_id, created_at DESC);

CREATE TABLE atlas.object_gc (
    object_id uuid PRIMARY KEY REFERENCES atlas.objects(id),
    owner_id uuid NOT NULL,
    queued_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE atlas.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.datasets FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_rows ON atlas.datasets TO atlas_app, atlas_worker
USING (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid)
WITH CHECK (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid);

ALTER TABLE atlas.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.objects FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_rows ON atlas.objects TO atlas_app, atlas_worker
USING (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid)
WITH CHECK (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid);

ALTER TABLE atlas.dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.dataset_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_rows ON atlas.dataset_versions TO atlas_app, atlas_worker
USING (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid)
WITH CHECK (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid);

ALTER TABLE atlas.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.entries FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_rows ON atlas.entries TO atlas_app, atlas_worker
USING (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid)
WITH CHECK (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid);

ALTER TABLE atlas.upload_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.upload_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_rows ON atlas.upload_requests TO atlas_app
USING (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid)
WITH CHECK (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid);

ALTER TABLE atlas.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.consents FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_rows ON atlas.consents TO atlas_app, atlas_worker
USING (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid)
WITH CHECK (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid);

ALTER TABLE atlas.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_rows ON atlas.jobs TO atlas_app
USING (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid)
WITH CHECK (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid);
CREATE POLICY worker_queue ON atlas.jobs TO atlas_worker USING (true) WITH CHECK (true);

ALTER TABLE atlas.object_gc ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.object_gc FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_rows ON atlas.object_gc TO atlas_app
USING (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid)
WITH CHECK (owner_id = nullif(current_setting('atlas.user_id', true), '')::uuid);
CREATE POLICY worker_cleanup ON atlas.object_gc TO atlas_worker USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA atlas TO atlas_app, atlas_worker;
GRANT SELECT, INSERT, DELETE ON atlas.datasets, atlas.objects, atlas.dataset_versions, atlas.entries,
    atlas.upload_requests, atlas.consents TO atlas_app;
GRANT SELECT ON atlas.reference_sources, atlas.reference_languages, atlas.reference_entries TO atlas_app, atlas_worker;
GRANT SELECT, INSERT ON atlas.object_gc TO atlas_app;
GRANT SELECT ON atlas.jobs TO atlas_app;
GRANT INSERT (id, owner_id, version_id, key) ON atlas.jobs TO atlas_app;
GRANT SELECT, DELETE ON atlas.objects TO atlas_worker;
GRANT SELECT ON atlas.datasets, atlas.dataset_versions, atlas.entries, atlas.consents TO atlas_worker;
GRANT SELECT, UPDATE ON atlas.jobs TO atlas_worker;
GRANT SELECT, DELETE ON atlas.object_gc TO atlas_worker;
