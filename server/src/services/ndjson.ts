import { RuntimeError } from './runtime-error.js';

/** Decode split UTF-8/NDJSON frames, reject malformed or oversized records, and cancel on every exit. */
export async function readNdjson(response: Response, onRecord: (record: Record<string, any>) => void, signal: AbortSignal, idleMs = 30_000) {
  if (!response.ok || !response.body) throw new RuntimeError('OLLAMA_REQUEST_FAILED', `Ollama request failed (${response.status})`);
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
  const aborted = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', aborted, { once: true });
  const parse = (line: string) => {
    if (!line.trim()) return;
    if (line.length > 65536) throw new RuntimeError('STREAM_INVALID', 'Model stream record exceeds its limit');
    let value; try { value = JSON.parse(line); } catch { throw new RuntimeError('STREAM_INVALID', 'Model returned a malformed stream'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RuntimeError('STREAM_INVALID', 'Invalid model stream record');
    if (value.error) throw new RuntimeError('MODEL_EXECUTION_FAILED', 'The model service reported an execution failure');
    onRecord(value);
  };
  try {
    while (true) {
      signal.throwIfAborted();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new RuntimeError('STREAM_IDLE', 'Model stream stopped responding', 408)); void reader.cancel().catch(() => {}); }, idleMs); });
      let chunk;
      try { chunk = await Promise.race([reader.read(), timeout]); } finally { clearTimeout(timer); }
      signal.throwIfAborted();
      if (chunk.done) { buffer += decoder.decode(); if (buffer) parse(buffer); break; }
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop()!; for (const line of lines) parse(line);
      if (buffer.length > 65536) throw new RuntimeError('STREAM_INVALID', 'Model stream record exceeds its limit');
    }
  } finally { signal.removeEventListener('abort', aborted); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
