CREATE TABLE atlas.reference_features (
    source_id text NOT NULL,
    language_id text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    target_source_id text NOT NULL,
    target_language_id text NOT NULL,
    metadata jsonb NOT NULL,
    PRIMARY KEY (source_id, language_id, key),
    FOREIGN KEY (source_id, language_id) REFERENCES atlas.reference_languages(source_id, id),
    FOREIGN KEY (target_source_id, target_language_id) REFERENCES atlas.reference_languages(source_id, id)
);
CREATE INDEX structural_reference_target ON atlas.reference_features(target_source_id, target_language_id);
GRANT SELECT ON atlas.reference_features TO atlas_app, atlas_worker;
