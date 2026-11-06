import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { ATLAS_LIMITS, atlasId, datasetInputSchema, uploadInputSchema, type DatasetInput, type UploadInput } from '../../shared/schemas/atlas.js';
import { importEvidence } from '../../shared/language-evidence.js';
import { asOwner, lockAccount } from './db.js';
import { AtlasError } from './errors.js';
import { ObjectStore } from './objects.js';

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export class Datasets {
  constructor(readonly pool: Pool, readonly objects: ObjectStore) {}

  async create(owner: string, raw: DatasetInput) {
    const input = datasetInputSchema.parse(raw), id = randomUUID();
    return asOwner(this.pool, owner, async client => {
      await lockAccount(client, owner);
      const count = await client.query('SELECT count(*)::int AS count FROM atlas.datasets');
      if (count.rows[0].count >= ATLAS_LIMITS.datasets) throw new AtlasError(409, 'dataset-limit', 'The account dataset limit has been reached.');
      const created = await client.query(`INSERT INTO atlas.datasets(id,owner_id,title,language_kind,glottocode)
        VALUES($1,$2,$3,$4,$5) RETURNING *`, [id, owner, input.title, input.languageKind, input.glottocode ?? null]);
      await client.query('INSERT INTO atlas.consents(dataset_id,owner_id) VALUES($1,$2)', [id, owner]);
      return created.rows[0];
    });
  }

  async list(owner: string) {
    return asOwner(this.pool, owner, async client => (await client.query(`SELECT d.*,
      (SELECT count(*)::int FROM atlas.dataset_versions v WHERE v.dataset_id=d.id) AS versions
      FROM atlas.datasets d ORDER BY d.created_at DESC LIMIT 10`)).rows);
  }

  async detail(owner: string, id: string) {
    atlasId.parse(id);
    return asOwner(this.pool, owner, async client => {
      const dataset = (await client.query('SELECT * FROM atlas.datasets WHERE id=$1', [id])).rows[0];
      if (!dataset) throw new AtlasError(404, 'not-found', 'Dataset unavailable.');
      const versions = (await client.query('SELECT * FROM atlas.dataset_versions WHERE dataset_id=$1 ORDER BY revision DESC LIMIT 20', [id])).rows;
      return { dataset, versions };
    });
  }

  async upload(owner: string, dataset: string, raw: UploadInput) {
    atlasId.parse(dataset);
    const input = uploadInputSchema.parse(raw), bytes = Buffer.from(input.content, 'utf8');
    let rows;
    try {
      rows = importEvidence(input.format, input.content, { maxBytes: ATLAS_LIMITS.bytes, maxRows: ATLAS_LIMITS.rows });
    } catch {
      throw new AtlasError(400, 'invalid-evidence', 'The file failed format, row, field or size validation.');
    }
    const requestHash = sha(JSON.stringify({ dataset, format: input.format, content: sha(bytes), metadata: input.metadata }));
    return asOwner(this.pool, owner, async client => {
      await lockAccount(client, owner);
      const parent = await client.query('SELECT id FROM atlas.datasets WHERE id=$1', [dataset]);
      if (!parent.rowCount) throw new AtlasError(404, 'not-found', 'Dataset unavailable.');
      const previous = (await client.query(`SELECT r.request_sha256,v.* FROM atlas.upload_requests r
        JOIN atlas.dataset_versions v ON v.id=r.version_id WHERE r.key=$1`, [input.key])).rows[0];
      if (previous) {
        if (previous.request_sha256 !== requestHash) throw new AtlasError(409, 'retry-conflict', 'This upload key belongs to different content.');
        return previous;
      }
      const counts = (await client.query(`SELECT count(*)::int AS count, coalesce(max(revision),0)::int AS last
        FROM atlas.dataset_versions WHERE dataset_id=$1`, [dataset])).rows[0];
      const storage = (await client.query('SELECT coalesce(sum(bytes),0)::bigint AS bytes FROM atlas.objects')).rows[0];
      if (counts.count >= ATLAS_LIMITS.versions || Number(storage.bytes) + bytes.length > ATLAS_LIMITS.accountBytes)
        throw new AtlasError(409, 'storage-limit', 'The account or dataset storage limit has been reached.');
      const object = await this.objects.put(bytes), version = randomUUID();
      // Keep the file if COMMIT becomes uncertain. Recovery checks database references before orphan cleanup.
      await client.query('INSERT INTO atlas.objects(id,owner_id,sha256,bytes,content_type) VALUES($1,$2,$3,$4,$5)',
        [object.id, owner, object.sha256, object.bytes, { csv: 'text/csv', json: 'application/json', text: 'text/plain' }[input.format]]);
      const saved = (await client.query(`INSERT INTO atlas.dataset_versions
        (id,dataset_id,owner_id,revision,object_id,import_format,row_count,rights,features) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [version, dataset, owner, counts.last + 1, object.id, input.format, rows.length, input.metadata.rights, input.metadata.features])).rows[0];
      await client.query(`INSERT INTO atlas.entries(version_id,owner_id,ordinal,entry_id,form,original_form,meaning,transcription,annotations)
        SELECT $1::uuid,$2::uuid,ordinal,id,form,"originalForm",meaning,transcription,annotations FROM jsonb_to_recordset($3::jsonb)
        AS r(ordinal int,id text,form text,"originalForm" text,meaning text,transcription text,annotations text)`,
      [version, owner, JSON.stringify(rows.map((row, ordinal) => ({ ...row, ordinal })))]);
      await client.query('INSERT INTO atlas.upload_requests(owner_id,key,request_sha256,version_id) VALUES($1,$2,$3,$4)',
        [owner, input.key, requestHash, version]);
      return saved;
    });
  }

  async entries(owner: string, version: string, offset = 0) {
    atlasId.parse(version);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > ATLAS_LIMITS.rows) throw new AtlasError(400, 'offset', 'Invalid page offset.');
    return asOwner(this.pool, owner, async client => {
      if (!(await client.query('SELECT id FROM atlas.dataset_versions WHERE id=$1', [version])).rowCount)
        throw new AtlasError(404, 'not-found', 'Version unavailable.');
      return (await client.query('SELECT entry_id,form,original_form,meaning,transcription,annotations FROM atlas.entries WHERE version_id=$1 ORDER BY ordinal LIMIT 100 OFFSET $2', [version, offset])).rows;
    });
  }

  async download(owner: string, version: string) {
    atlasId.parse(version);
    const object = await asOwner(this.pool, owner, async client => (await client.query(`SELECT o.* FROM atlas.objects o
      JOIN atlas.dataset_versions v ON v.object_id=o.id WHERE v.id=$1`, [version])).rows[0]);
    if (!object) throw new AtlasError(404, 'not-found', 'Version unavailable.');
    try {
      return { bytes: await this.objects.read(object.id, object), contentType: object.content_type };
    } catch {
      throw new AtlasError(409, 'object-integrity', 'The saved file failed its integrity check.');
    }
  }

  async remove(owner: string, dataset: string) {
    atlasId.parse(dataset);
    return asOwner(this.pool, owner, async client => {
      await lockAccount(client, owner);
      if (!(await client.query('SELECT id FROM atlas.datasets WHERE id=$1', [dataset])).rowCount)
        throw new AtlasError(404, 'not-found', 'Dataset unavailable.');
      const queued = await client.query(`INSERT INTO atlas.object_gc(object_id,owner_id)
        SELECT object_id,owner_id FROM atlas.dataset_versions WHERE dataset_id=$1 ON CONFLICT DO NOTHING RETURNING object_id`, [dataset]);
      await client.query('DELETE FROM atlas.datasets WHERE id=$1', [dataset]);
      return { state: 'removed', objectsPending: queued.rowCount };
    });
  }
}
