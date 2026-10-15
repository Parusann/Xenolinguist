import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import manifest from '../../../vendor/model-manifest.json';

export const phoneManifest = manifest.groups.find(group => group.id === 'phones')!;
export async function verifyPhoneAssets(directory: string) {
  for (const file of phoneManifest.files) {
    const target = path.join(directory, file.file);
    let size: number;
    try { size = (await fs.stat(target)).size; }
    catch { throw Object.assign(new Error(`Required phone asset is missing: ${file.file}`), { code: 'IPA_MODEL_MISSING' }); }
    const hash = createHash('sha256');
    if (size === file.bytes) for await (const chunk of createReadStream(target)) hash.update(chunk);
    if (size !== file.bytes || hash.digest('hex') !== file.sha256)
      throw Object.assign(new Error(`Phone asset checksum mismatch: ${file.file}`), { code: 'IPA_MODEL_INVALID' });
  }
  return phoneManifest.files.find(file => file.file.endsWith('.onnx'))!.sha256;
}
