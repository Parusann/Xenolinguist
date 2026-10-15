import supertest from 'supertest';
// Route tests use a real credential. Boundary tests use raw supertest independently.
export const testSession = { secret: 'a'.repeat(64), mode: 'desktop' as const };
export default function request(app: Parameters<typeof supertest>[0]) {
  return supertest.agent(app).set('X-Xeno-Session', testSession.secret);
}
