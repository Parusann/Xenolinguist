import { betterAuth } from 'better-auth';
import type { Pool } from 'pg';
import type { AtlasConfig } from './config.js';

export function createAuth(config: Pick<AtlasConfig, 'origin' | 'authSecret'>, database: Pool) {
  return betterAuth({ appName: 'Xenolinguist Atlas', database, secret: config.authSecret, baseURL: config.origin,
    trustedOrigins: [config.origin], logger: { disabled: true },
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 7 * 86400, updateAge: 86400 },
    advanced: { database: { generateId: 'uuid' }, useSecureCookies: false,
      cookiePrefix: 'xeno-atlas', cookies: { session_token: { attributes: { sameSite: 'lax', httpOnly: true } } } } });
}
