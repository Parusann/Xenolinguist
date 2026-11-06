CREATE TABLE auth.desktop_grants (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
    code_sha256 text NOT NULL UNIQUE CHECK (code_sha256 ~ '^[a-f0-9]{64}$'),
    label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz
);
CREATE TABLE auth.desktop_tokens (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
    token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
    label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX desktop_token_owner ON auth.desktop_tokens(owner_id, created_at);
