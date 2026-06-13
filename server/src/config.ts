import path from 'path';

/** Root directory for persisted data (profiles JSON + audio blobs). */
export function dataDir(): string {
  const fromEnv = process.env.DATA_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  // Dev default anchored to this source file (<repo>/server/data). In the CJS
  // bundle `import.meta.dirname` is undefined, but DATA_DIR is always set there
  // (by the Electron main process), so this fallback only runs in dev/tests.
  const here = import.meta.dirname;
  return here ? path.resolve(here, '../data') : path.resolve(process.cwd(), 'data');
}

/** Default Ollama model for new chats; user-overridable via OLLAMA_MODEL. */
export function defaultModel(): string {
  return process.env.OLLAMA_MODEL || 'gemma4:e4b';
}

/** Base URL of the local Ollama daemon; overridable via OLLAMA_BASE_URL. */
export function ollamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
}

/** Built SPA directory to serve in production, or null in dev (Vite serves). */
export function clientDist(): string | null {
  const fromEnv = process.env.CLIENT_DIST;
  return fromEnv ? path.resolve(fromEnv) : null;
}

/** Absolute path to the bundled espeak-ng binary, or null (browser TTS only). */
export function espeakPath(): string | null {
  return process.env.ESPEAK_PATH || null;
}

/** Port to bind; 0 lets the OS pick a free port (used by the desktop build). */
export function port(): number {
  const raw = process.env.PORT;
  if (!raw?.trim()) return 3001; // unset/blank → default (not a silent OS-assigned 0)
  const n = Number(raw);
  return Number.isFinite(n) ? n : 3001;
}

/** Absolute path to the bundled whisper.cpp binary, or null (STT disabled). */
export function whisperBinPath(): string | null {
  return process.env.WHISPER_BIN || null;
}

/** Absolute path to the bundled whisper ggml model, or null (STT disabled). */
export function whisperModelPath(): string | null {
  return process.env.WHISPER_MODEL || null;
}

/** Absolute path to the bundled IPA phoneme model dir, or null (IPA disabled). */
export function ipaModelDir(): string | null {
  return process.env.IPA_MODEL_DIR || null;
}
