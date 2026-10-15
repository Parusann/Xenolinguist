import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import manifest from '../../../vendor/model-manifest.json';

const group = manifest.groups.find(g => g.id === 'whisper')!;

/** Verify each configured native asset before execution; no cached identity for replaced files. */
export async function verifyWhisperAssets(bin: string, model: string, signal?: AbortSignal) {
  for (const file of group.files) {
    signal?.throwIfAborted();
    const target = file.file.endsWith('.bin') ? model : file.file.endsWith('.exe') ? bin : path.join(path.dirname(bin), file.file);
    const info = await stat(target);
    if (!info.isFile() || info.size !== file.bytes) throw new Error('Whisper asset size differs from manifest');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(target)) { signal?.throwIfAborted(); hash.update(chunk); }
    if (hash.digest('hex') !== file.sha256) throw new Error('Whisper asset checksum differs from manifest');
  }
  return { engineRevision: group.upstreamRevision!, modelId: 'ggml-base-q5_1' as const,
    modelSha256: group.files.find(f => f.file.endsWith('.bin'))!.sha256,
    executableSha256: group.files.find(f => f.file.endsWith('.exe'))!.sha256,
    runtimeFiles: group.files.map(f => ({ ...f })) };
}
