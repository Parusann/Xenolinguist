import path from 'path';

/** Root directory for persisted data (profiles JSON + audio blobs). */
export function dataDir(): string {
  const fromEnv = process.env.DATA_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  // Dev default: <repo>/server/data (this file compiles under server/).
  return path.resolve(import.meta.dirname, '../data');
}

/** Default Ollama model for new chats; user-overridable via OLLAMA_MODEL. */
export function defaultModel(): string {
  return process.env.OLLAMA_MODEL || 'gemma4:e4b';
}

/** Built SPA directory to serve in production, or null in dev (Vite serves). */
export function clientDist(): string | null {
  const fromEnv = process.env.CLIENT_DIST;
  return fromEnv ? path.resolve(fromEnv) : null;
}

/** Port to bind; 0 lets the OS pick a free port (used by the desktop build). */
export function port(): number {
  const raw = process.env.PORT;
  if (raw === undefined) return 3001;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 3001;
}
