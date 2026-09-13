import { expect, it } from 'vitest';
import { readNdjson } from '../services/ndjson.js';
it('preserves split UTF-8, split lines and a final line without a newline', async () => {
  const bytes = new TextEncoder().encode('{"token":"é"}\n{"status":"success"}');
  const response = new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } }));
  const records: unknown[] = []; await readNdjson(response, value => records.push(value), new AbortController().signal);
  expect(records).toEqual([{ token: 'é' }, { status: 'success' }]);
});
it('rejects malformed frames, explicit errors, non-2xx and oversized unfinished lines', async () => {
  for (const text of ['not json\n', '{"error":"private model detail"}\n', 'x'.repeat(65537)])
    await expect(readNdjson(new Response(text), () => {}, new AbortController().signal)).rejects.toThrow();
  await expect(readNdjson(new Response('', { status: 500 }), () => {}, new AbortController().signal)).rejects.toThrow('500');
});
it('cancels a stalled reader on idle timeout and a pending read on abort', async () => {
  let stopped = false;
  const response = new Response(new ReadableStream({ cancel() { stopped = true; } }));
  await expect(readNdjson(response, () => {}, new AbortController().signal, 20)).rejects.toThrow('stopped responding');
  expect(stopped).toBe(true);
  const controller = new AbortController();
  const pending = readNdjson(new Response(new ReadableStream()), () => {}, controller.signal);
  controller.abort(); await expect(pending).rejects.toThrow();
});
