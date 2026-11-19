import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AtlasError } from './errors.js';
import { atlasId } from '../../shared/schemas/atlas.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
export class DesktopAuth {
  constructor(readonly pool: Pool) {}

  async grant(owner: string, raw: unknown) {
    const input = z.strictObject({ label: z.string().trim().min(1).max(80) }).parse(raw), code = randomBytes(32).toString('hex');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))', [owner]);
      await client.query('DELETE FROM auth.desktop_grants WHERE expires_at < now()');
      await client.query('DELETE FROM auth.desktop_tokens WHERE expires_at < now()');
      const counts = (await client.query(`SELECT (SELECT count(*) FROM auth.desktop_tokens WHERE owner_id=$1)::int AS devices,
        (SELECT count(*) FROM auth.desktop_grants WHERE owner_id=$1 AND consumed_at IS NULL)::int AS grants`, [owner])).rows[0];
      if (counts.devices >= 10 || counts.grants >= 5) throw new AtlasError(409, 'connection-limit', 'Revoke an unused desktop connection or wait for unused codes to expire.');
      const row = (await client.query(`INSERT INTO auth.desktop_grants(id,owner_id,code_sha256,label,expires_at)
        VALUES($1,$2,$3,$4,now()+interval '2 minutes') RETURNING expires_at`, [randomUUID(), owner, sha(code), input.label])).rows[0];
      await client.query('COMMIT'); return { code, expiresAt: row.expires_at };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async exchange(raw: unknown) {
    const { code } = z.strictObject({ code: z.string().regex(/^[a-f0-9]{64}$/u) }).parse(raw), client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const candidate = (await client.query('SELECT owner_id FROM auth.desktop_grants WHERE code_sha256=$1', [sha(code)])).rows[0];
      if (!candidate) throw new AtlasError(401, 'invalid-connection-code', 'This connection code is unavailable, expired or already used.');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))', [candidate.owner_id]);
      const grant = (await client.query(`SELECT * FROM auth.desktop_grants WHERE code_sha256=$1 AND consumed_at IS NULL
        AND expires_at > now() FOR UPDATE`, [sha(code)])).rows[0];
      if (!grant) throw new AtlasError(401, 'invalid-connection-code', 'This connection code is unavailable, expired or already used.');
      if (Number((await client.query('SELECT count(*) AS n FROM auth.desktop_tokens WHERE owner_id=$1 AND expires_at > now()', [grant.owner_id])).rows[0].n) >= 10)
        throw new AtlasError(409, 'connection-limit', 'Revoke an unused desktop connection first.');
      const token = randomBytes(32).toString('hex'), id = randomUUID();
      const saved = (await client.query(`INSERT INTO auth.desktop_tokens(id,owner_id,token_sha256,label,expires_at)
        VALUES($1,$2,$3,$4,now()+interval '7 days') RETURNING expires_at`, [id, grant.owner_id, sha(token), grant.label])).rows[0];
      await client.query('UPDATE auth.desktop_grants SET consumed_at=now() WHERE id=$1', [grant.id]);
      const user = (await client.query('SELECT id,name,email FROM auth."user" WHERE id=$1', [grant.owner_id])).rows[0];
      await client.query('COMMIT'); return { token, id, expiresAt: saved.expires_at, user };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async session(header: string) {
    const token = /^Bearer ([a-f0-9]{64})$/u.exec(header)?.[1];
    if (!token) return null;
    return (await this.pool.query(`SELECT t.id AS connection_id,u.id,u.name,u.email FROM auth.desktop_tokens t
      JOIN auth."user" u ON u.id=t.owner_id WHERE t.token_sha256=$1 AND t.expires_at > now()`, [sha(token)])).rows[0] ?? null;
  }

  async list(owner: string) {
    return (await this.pool.query(`SELECT id,label,created_at,expires_at FROM auth.desktop_tokens
      WHERE owner_id=$1 AND expires_at > now() ORDER BY created_at DESC`, [owner])).rows;
  }

  async revoke(owner: string, id: string) {
    atlasId.parse(id);
    if (!(await this.pool.query('DELETE FROM auth.desktop_tokens WHERE owner_id=$1 AND id=$2', [owner, id])).rowCount)
      throw new AtlasError(404, 'not-found', 'Connection unavailable.');
    return { revoked: true };
  }
}
