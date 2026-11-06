import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadWoldReference, type ReferenceBundle } from '../../evaluation/src/atlas/ingest/wold.js';
import type { AtlasConfig } from './config.js';
import { loadConfig } from './config.js';
import { atlasPool } from './db.js';

export async function ingestReferences(config: AtlasConfig) {
  if (!config.adminDatabaseUrl) throw new Error('Reference ingestion requires the setup connection');
  const reference = await loadWoldReference(path.join(config.source, 'evaluation/fixtures/reference/wold-pilot'));
  const pool = atlasPool(config.adminDatabaseUrl, 1, 120000), client = await pool.connect();
  try {
    await client.query('BEGIN; SET LOCAL ROLE atlas_owner');
    await client.query('SELECT pg_advisory_xact_lock(43185439)');
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
    }
    const languages = (await client.query('SELECT id,name,metadata FROM atlas.reference_languages WHERE source_id=$1', [reference.id])).rows
      .sort((a, b) => a.id.localeCompare(b.id, 'en'));
    const entries = (await client.query(`SELECT id,language_id AS "languageId",concept_id AS "conceptId",meaning,form,metadata
      FROM atlas.reference_entries WHERE source_id=$1`, [reference.id])).rows.sort((a, b) => a.id.localeCompare(b.id, 'en'));
    if (!isDeepStrictEqual(languages, reference.languages) || !isDeepStrictEqual(entries, reference.entries))
      throw new Error('Stored reference language or form data differs');
    await client.query('COMMIT');
    return { source: reference.id, sha256: reference.sha256, languages: languages.length, forms: entries.length, alreadyPresent: !!previous };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}

export type StoredReference = Pick<ReferenceBundle, 'id' | 'url' | 'version' | 'license' | 'attribution' | 'languages' | 'entries'>;

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  loadConfig().then(ingestReferences).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error instanceof Error ? error.message : 'Reference ingestion failed'); process.exitCode = 1; });
}
