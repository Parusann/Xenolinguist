import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { ComparisonInput, ComparisonReport } from '../../../shared/schemas/atlas-comparison.js';
import { ATLAS_LIMITS } from '../../../shared/schemas/atlas.js';
import { asOwner, lockAccount, lockObjects } from '../db.js';
import { ObjectStore } from '../objects.js';
import { comparisonReferences } from '../references.js';
import { compute, ComputeError } from './compute.js';

export type ClaimedJob = { id: string; owner_id: string; version_id: string; lease_token: string; attempts: number };
class InputUnavailable extends Error {}
export class AtlasWorker {
  private leader?: PoolClient;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private controller?: AbortController;
  private stopping = false;
  private lastSweep = 0;
  readonly diagnostics = { active: false, running: false, lastError: null as string | null, completed: 0, lastCleanupAt: null as string | null };
  constructor(readonly pool: Pool, readonly objects: ObjectStore) {}

  async start() {
    if (this.leader) return;
    const client = await this.pool.connect();
    if (!(await client.query('SELECT pg_try_advisory_lock(43185441) AS acquired')).rows[0].acquired) {
      client.release(); throw new Error('Another atlas worker owns the queue');
    }
    client.on('error', () => { this.diagnostics.lastError = 'database-unavailable'; this.stopping = true; this.controller?.abort(); });
    this.leader = client; this.diagnostics.active = true; this.stopping = false;
    this.schedule(0);
  }

  private schedule(delay = 1000) {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.pending = this.tick().catch(() => { this.diagnostics.lastError = 'worker-operation-failed'; })
        .finally(() => { this.pending = undefined; this.schedule(); });
    }, delay);
    this.timer.unref();
  }

  async claim(): Promise<ClaimedJob | undefined> {
    await this.pool.query(`UPDATE atlas.jobs SET status='failed',error_code='attempt-limit',finished_at=now(),lease_token=NULL,lease_until=NULL
      WHERE attempts >= 3 AND (status='queued' OR (status='running' AND lease_until < now()))`);
    return (await this.pool.query(`WITH next AS (
      SELECT id FROM atlas.jobs WHERE attempts < 3 AND (status='queued' OR (status='running' AND lease_until < now()))
      ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE atlas.jobs j SET status='running',attempts=attempts+1,lease_token=$1,lease_until=now()+interval '90 seconds'
      FROM next WHERE j.id=next.id RETURNING j.id,j.owner_id,j.version_id,j.lease_token,j.attempts`, [randomUUID()])).rows[0];
  }

  async input(job: ClaimedJob) {
    return asOwner(this.pool, job.owner_id, async client => {
      const version = (await client.query(`SELECT v.id,v.features,v.row_count,o.id AS object_id,o.sha256,o.bytes FROM atlas.dataset_versions v
        JOIN atlas.objects o ON o.id=v.object_id WHERE v.id=$1 AND v.owner_id=$2`, [job.version_id, job.owner_id])).rows[0];
      if (!version) throw new InputUnavailable();
      try { await this.objects.read(version.object_id, version); } catch { throw new InputUnavailable(); }
      const entries = (await client.query(`SELECT entry_id AS id,form,meaning,transcription FROM atlas.entries
        WHERE version_id=$1 ORDER BY ordinal`, [job.version_id])).rows;
      if (entries.length !== version.row_count) throw new InputUnavailable();
      const input: ComparisonInput = { versionId: version.id, objectSha256: version.sha256, entries, features: version.features };
      return { input, object: { id: version.object_id, sha256: version.sha256, bytes: version.bytes } };
    });
  }

  async publish(job: ClaimedJob, report: ComparisonReport) {
    if (Buffer.byteLength(JSON.stringify(report), 'utf8') > 4 * 1024 * 1024) throw new Error('Report exceeds its bound');
    return asOwner(this.pool, job.owner_id, async client => {
      await lockAccount(client, job.owner_id);
      const version = (await client.query(`SELECT o.id,o.sha256,o.bytes FROM atlas.dataset_versions v JOIN atlas.objects o ON o.id=v.object_id
        WHERE v.id=$1 AND v.owner_id=$2`, [job.version_id, job.owner_id])).rows[0];
      if (!version || report.input.versionId !== job.version_id || report.input.objectSha256 !== version.sha256) throw new InputUnavailable();
      try { await this.objects.read(version.id, version); } catch { throw new InputUnavailable(); }
      const sources = (await client.query('SELECT id,sha256 FROM atlas.reference_sources')).rows;
      if (report.referenceSources.some(source => !sources.some(stored => stored.id === source.id && stored.sha256 === source.sha256)))
        throw new InputUnavailable();
      const result = await client.query(`UPDATE atlas.jobs SET status='complete',report=$3,finished_at=now(),lease_until=NULL,lease_token=NULL
        WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until > now()`, [job.id, job.lease_token, report]);
      return result.rowCount === 1;
    });
  }

  async perform(job: ClaimedJob) {
    const controller = new AbortController(); this.controller = controller; this.diagnostics.running = true;
    const deadline = setTimeout(() => controller.abort('timeout'), ATLAS_LIMITS.jobMs);
    let heartbeating = false;
    const heartbeat = setInterval(() => {
      if (heartbeating) return; heartbeating = true;
      void this.pool.query(`UPDATE atlas.jobs SET lease_until=now()+interval '90 seconds'
        WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until > now()`, [job.id, job.lease_token])
        .then(result => { if (!result.rowCount) controller.abort(); }, () => controller.abort()).finally(() => { heartbeating = false; });
    }, 10000);
    try {
      const { input } = await this.input(job), references = await comparisonReferences(this.pool);
      const report = await compute(input, references, controller.signal);
      if (!controller.signal.aborted && await this.publish(job, report)) { this.diagnostics.completed++; this.diagnostics.lastError = null; }
    } catch (error) {
      if (error instanceof ComputeError && error.code === 'interrupted') return;
      const code = error instanceof InputUnavailable ? 'input-unavailable' : error instanceof ComputeError && error.code === 'timeout' ? 'timeout' : 'processing-error';
      await this.pool.query(`UPDATE atlas.jobs SET status='failed',error_code=$3,finished_at=now(),lease_token=NULL,lease_until=NULL
        WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until > now()`, [job.id, job.lease_token, code]);
      this.diagnostics.lastError = code;
    } finally { clearTimeout(deadline); clearInterval(heartbeat); this.controller = undefined; this.diagnostics.running = false; }
  }

  async cleanupPending() {
    const pending = (await this.pool.query('SELECT object_id,owner_id FROM atlas.object_gc ORDER BY queued_at LIMIT 20')).rows;
    let removed = 0;
    for (const row of pending) await asOwner(this.pool, row.owner_id, async client => {
      await lockAccount(client, row.owner_id); await lockObjects(client);
      if ((await client.query('SELECT 1 FROM atlas.dataset_versions WHERE object_id=$1', [row.object_id])).rowCount) return;
      if (!(await client.query('SELECT 1 FROM atlas.object_gc WHERE object_id=$1', [row.object_id])).rowCount) return;
      await this.objects.remove(row.object_id);
      await client.query('DELETE FROM atlas.object_gc WHERE object_id=$1', [row.object_id]);
      await client.query('DELETE FROM atlas.objects WHERE id=$1', [row.object_id]);
      removed++;
    });
    return removed;
  }

  async cleanupOrphans(minimumAgeMs = 3600000) {
    if (minimumAgeMs < 3600000) throw new Error('Orphan grace period cannot be shortened');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Exclusive publication lock prevents an uncommitted upload from being mistaken for an orphan.
      await client.query('SELECT pg_advisory_xact_lock(43185440)');
      const known = new Set((await client.query('SELECT id FROM atlas.objects')).rows.map(row => row.id));
      const inventory = await this.objects.inventory(); let removed = 0;
      for (const file of inventory) {
        if (removed >= 100 || known.has(file.id) || Date.now() - file.modifiedAt < minimumAgeMs) continue;
        if (file.name.endsWith('.partial')) await this.objects.removePartial(file.id); else await this.objects.remove(file.id);
        removed++;
      }
      await client.query('COMMIT'); return removed;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async tick() {
    const job = await this.claim();
    if (job) await this.perform(job);
    await this.cleanupPending();
    if (Date.now() - this.lastSweep >= 60000) {
      await this.cleanupOrphans(); this.lastSweep = Date.now(); this.diagnostics.lastCleanupAt = new Date().toISOString();
    }
  }

  async stop() {
    this.stopping = true; clearTimeout(this.timer); this.controller?.abort();
    await this.pending;
    if (this.leader) {
      await this.leader.query('SELECT pg_advisory_unlock(43185441)').catch(() => {});
      this.leader.release(); this.leader = undefined;
    }
    this.diagnostics.active = false;
  }
}
