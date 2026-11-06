import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { loadWoldReference, type ReferenceBundle } from '../../evaluation/src/atlas/ingest/wold.js';
import { loadWalsReference, type StructuralFeature } from '../../evaluation/src/atlas/ingest/wals.js';
import type { ReferenceLanguage } from '../../shared/schemas/atlas-comparison.js';
import type { AtlasConfig } from './config.js';
import { loadConfig } from './config.js';
import { atlasPool } from './db.js';

export async function ingestReferences(config: AtlasConfig) {
  if (!config.adminDatabaseUrl) throw new Error('Reference ingestion requires the setup connection');
  const reference = await loadWoldReference(path.join(config.source, 'evaluation/fixtures/reference/wold-pilot'));
  const structural = await loadWalsReference(path.join(config.source, 'evaluation/fixtures/reference/wals-pilot'));
  const pool = atlasPool(config.adminDatabaseUrl, 1, 120000), client = await pool.connect();
  try {
    await client.query('BEGIN; SET LOCAL ROLE atlas_owner');
    await client.query('SELECT pg_advisory_xact_lock(43185439)');
    const vocabulary = await ingestBundle(client, reference);
    const features = await ingestBundle(client, structural);
    await client.query('COMMIT');
    return { ...vocabulary, structural: features };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}

async function ingestBundle(client: PoolClient, reference: ReferenceBundle & { features?: StructuralFeature[] }) {
    const previous = (await client.query('SELECT * FROM atlas.reference_sources WHERE id=$1', [reference.id])).rows[0];
    if (previous) {
      if (previous.sha256 !== reference.sha256) throw new Error('Reference content changed under an existing source version');
      if (!isDeepStrictEqual(previous, { id: reference.id, version: reference.version, sha256: reference.sha256, url: reference.url,
        license: reference.license, attribution: reference.attribution, manifest: reference.manifest }))
        throw new Error('Reference source metadata differs');
    } else {
      await client.query(`INSERT INTO atlas.reference_sources(id,version,sha256,url,license,attribution,manifest)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [reference.id, reference.version, reference.sha256, reference.url, reference.license, reference.attribution, reference.manifest]);
      await client.query(`INSERT INTO atlas.reference_languages(source_id,id,name,metadata)
        SELECT $1,id,name,metadata FROM jsonb_to_recordset($2::jsonb) AS r(id text,name text,metadata jsonb)`,
      [reference.id, JSON.stringify(reference.languages)]);
      await client.query(`INSERT INTO atlas.reference_entries(source_id,id,language_id,concept_id,meaning,form,metadata)
        SELECT $1,id,"languageId","conceptId",meaning,form,metadata FROM jsonb_to_recordset($2::jsonb)
        AS r(id text,"languageId" text,"conceptId" text,meaning text,form text,metadata jsonb)`,
      [reference.id, JSON.stringify(reference.entries)]);
      if (reference.features) await client.query(`INSERT INTO atlas.reference_features(source_id,language_id,key,value,target_source_id,target_language_id,metadata)
        SELECT $1,"languageId",key,value,"targetSourceId","targetLanguageId",metadata FROM jsonb_to_recordset($2::jsonb)
        AS r("languageId" text,key text,value text,"targetSourceId" text,"targetLanguageId" text,metadata jsonb)`, [reference.id, JSON.stringify(reference.features)]);
    }
    const languages = (await client.query('SELECT id,name,metadata FROM atlas.reference_languages WHERE source_id=$1', [reference.id])).rows
      .sort((a, b) => a.id.localeCompare(b.id, 'en'));
    const entries = (await client.query(`SELECT id,language_id AS "languageId",concept_id AS "conceptId",meaning,form,metadata
      FROM atlas.reference_entries WHERE source_id=$1`, [reference.id])).rows.sort((a, b) => a.id.localeCompare(b.id, 'en'));
    if (!isDeepStrictEqual(languages, reference.languages) || !isDeepStrictEqual(entries, reference.entries))
      throw new Error('Stored reference language or form data differs');
    const features = (await client.query(`SELECT language_id AS "languageId",key,value,target_source_id AS "targetSourceId",
      target_language_id AS "targetLanguageId",metadata FROM atlas.reference_features WHERE source_id=$1`, [reference.id])).rows
      .sort((a, b) => a.languageId.localeCompare(b.languageId, 'en') || a.key.localeCompare(b.key, 'en'));
    if (!isDeepStrictEqual(features, reference.features ?? [])) throw new Error('Stored reference structural data differs');
    return { source: reference.id, sha256: reference.sha256, languages: languages.length, forms: entries.length, features: features.length, alreadyPresent: !!previous };
}

export type StoredReference = Pick<ReferenceBundle, 'id' | 'url' | 'version' | 'license' | 'attribution' | 'languages' | 'entries'>;

export async function comparisonReferences(pool: Pool): Promise<ReferenceLanguage[]> {
  const [languages, entries, features] = await Promise.all([
    pool.query(`SELECT l.*,s.sha256,s.url,s.license,s.attribution FROM atlas.reference_languages l
      JOIN atlas.reference_sources s ON s.id=l.source_id WHERE EXISTS
      (SELECT 1 FROM atlas.reference_entries e WHERE e.source_id=l.source_id AND e.language_id=l.id) ORDER BY l.source_id,l.id`),
    pool.query('SELECT * FROM atlas.reference_entries ORDER BY source_id,language_id,id'),
    pool.query(`SELECT f.*,s.sha256 FROM atlas.reference_features f JOIN atlas.reference_sources s ON s.id=f.source_id`),
  ]);
  return languages.rows.map(language => ({ id: language.id, name: language.name, sourceId: language.source_id,
    sourceSha256: language.sha256, sourceUrl: language.url, license: language.license, attribution: language.attribution,
    entries: entries.rows.filter(entry => entry.source_id === language.source_id && entry.language_id === language.id)
      .map(entry => ({ id: entry.id, form: entry.form, meaning: entry.meaning, conceptId: entry.concept_id,
        concepticonId: entry.metadata.concepticonId || undefined, transcription: entry.metadata.Segments || undefined })),
    features: Object.fromEntries(features.rows.filter(feature => feature.target_source_id === language.source_id && feature.target_language_id === language.id)
      .map(feature => [feature.key, { value: feature.value, sourceId: feature.source_id, sourceSha256: feature.sha256,
        sourceUrl: feature.metadata.sourceUrl, citation: feature.metadata.citation, allowedValues: feature.metadata.allowedValues,
        sourceRecord: { id: feature.metadata.sourceRow.ID, references: feature.metadata.sourceRow.Source, comment: feature.metadata.sourceRow.Comment } }])),
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  loadConfig().then(ingestReferences).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error instanceof Error ? error.message : 'Reference ingestion failed'); process.exitCode = 1; });
}
