import { Pool, type PoolClient } from 'pg';

export function atlasPool(connectionString: string, max = 4, statementTimeoutMs = 10000) {
  const pool = new Pool({ connectionString, max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    application_name: 'xenolinguist-atlas', statement_timeout: statementTimeoutMs, lock_timeout: 3000 });
  // pg evicts a disconnected idle client before emitting this event. Keep the API alive
  // for a fresh connection; never log the error's client object or connection credentials.
  pool.on('error', () => console.error('Atlas idle database connection lost; a later request will reconnect.'));
  return pool;
}

/** Only generated acceptance/recovery databases may be retired; never force active clients off. */
export async function dropDisposableDatabase(admin: Pool, database: string) {
  if (!/^xeno_atlas_(test|restore)_[a-f0-9]{12}$/.test(database)) throw new Error('Invalid disposable database name');
  // pg-pool can resolve end() before client sockets finish closing. Observe server-side
  // connection termination instead of assuming a platform-specific teardown delay.
  const deadline = Date.now() + 5000;
  while (Number((await admin.query('SELECT count(*) AS n FROM pg_stat_activity WHERE datname=$1', [database])).rows[0].n)) {
    if (Date.now() >= deadline) throw new Error('Disposable database connections did not drain');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  await admin.query('DROP DATABASE IF EXISTS "' + database + '"');
}

export async function lockAccount(client: PoolClient, owner: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [owner]);
}

/** Upload publication and physical deletion share this lock with consistent backups and orphan scans. */
export async function lockObjects(client: PoolClient) {
  await client.query('SELECT pg_advisory_xact_lock_shared(43185440)');
}

/** Tenant context lasts for one transaction, including when a pooled connection is reused. */
export async function asOwner<T>(pool: Pool, owner: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('atlas.user_id', $1, true)", [owner]);
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { destroy = true; }
    throw error;
  } finally { client.release(destroy); }
}
