import { Pool, type PoolClient } from 'pg';

export function atlasPool(connectionString: string, max = 4, statementTimeoutMs = 10000) {
  return new Pool({ connectionString, max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    application_name: 'xenolinguist-atlas', statement_timeout: statementTimeoutMs, lock_timeout: 3000 });
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
