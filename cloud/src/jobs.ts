import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { ATLAS_LIMITS, atlasId, comparisonRequestSchema } from '../../shared/schemas/atlas.js';
import { asOwner, lockAccount } from './db.js';
import { AtlasError } from './errors.js';

const summary = 'id,version_id,status,attempts,error_code,created_at,finished_at';
export class Jobs {
  constructor(readonly pool: Pool) {}

  async create(owner: string, version: string, raw: unknown) {
    atlasId.parse(version);
    const input = comparisonRequestSchema.parse(raw);
    return asOwner(this.pool, owner, async client => {
      await lockAccount(client, owner);
      if (!(await client.query('SELECT id FROM atlas.dataset_versions WHERE id=$1', [version])).rowCount)
        throw new AtlasError(404, 'not-found', 'Version unavailable.');
      const previous = (await client.query('SELECT ' + summary + ' FROM atlas.jobs WHERE key=$1', [input.key])).rows[0];
      if (previous) {
        if (previous.version_id !== version) throw new AtlasError(409, 'retry-conflict', 'This comparison key belongs to a different version.');
        return previous;
      }
      const counts = (await client.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status IN ('queued','running'))::int AS active FROM atlas.jobs`)).rows[0];
      if (counts.active >= ATLAS_LIMITS.queuedJobs || counts.total >= 1000)
        throw new AtlasError(409, 'job-limit', 'The comparison limit has been reached. Remove unused datasets or wait for queued work.');
      return (await client.query('INSERT INTO atlas.jobs(id,owner_id,version_id,key) VALUES($1,$2,$3,$4) RETURNING ' + summary,
        [randomUUID(), owner, version, input.key])).rows[0];
    });
  }

  async list(owner: string, version: string) {
    atlasId.parse(version);
    return asOwner(this.pool, owner, async client => {
      if (!(await client.query('SELECT id FROM atlas.dataset_versions WHERE id=$1', [version])).rowCount)
        throw new AtlasError(404, 'not-found', 'Version unavailable.');
      return (await client.query('SELECT ' + summary + ' FROM atlas.jobs WHERE version_id=$1 ORDER BY created_at DESC LIMIT 100', [version])).rows;
    });
  }

  async detail(owner: string, id: string) {
    atlasId.parse(id);
    return asOwner(this.pool, owner, async client => {
      const job = (await client.query('SELECT ' + summary + ',report FROM atlas.jobs WHERE id=$1', [id])).rows[0];
      if (!job) throw new AtlasError(404, 'not-found', 'Comparison unavailable.');
      return job;
    });
  }

  async cancel(owner: string, id: string) {
    atlasId.parse(id);
    return asOwner(this.pool, owner, async client => {
      await lockAccount(client, owner);
      const result = await client.query(`UPDATE atlas.jobs SET status='cancelled',finished_at=now(),lease_token=NULL,lease_until=NULL
        WHERE id=$1 AND status IN ('queued','running') RETURNING ` + summary, [id]);
      if (result.rowCount) return result.rows[0];
      if (!(await client.query('SELECT id FROM atlas.jobs WHERE id=$1', [id])).rowCount)
        throw new AtlasError(404, 'not-found', 'Comparison unavailable.');
      throw new AtlasError(409, 'already-finished', 'This comparison has already finished.');
    });
  }
}
