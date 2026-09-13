import { access, mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { dataDir, espeakPath, whisperBinPath, whisperModelPath, ipaModelDir } from '../config.js';
import { getModelInventory } from './ollama-runtime.js';
import type { Capability, RuntimeCapabilities } from '../../../shared/schemas/capabilities.js';
import { phoneManifest } from './model-assets.js';

const available = (detail: string): Capability => ({ state: 'available', detail });
const unavailable = (detail: string): Capability => ({ state: 'unavailable', detail });
async function files(paths: (string | null)[], label: string) { try { for (const file of paths) { if (!file) throw Error(); await access(file); } return available(label + ' files present; execution is checked when requested'); } catch { return unavailable(label + ' files are missing'); } }
export async function runtimeCapabilities(): Promise<RuntimeCapabilities> {
  let storage: Capability;
  const probe = path.join(dataDir(), '.readiness-' + randomUUID());
  try { await mkdir(dataDir(), { recursive: true }); await writeFile(probe, 'probe', { flag: 'wx' }); await unlink(probe); storage = available('Local storage write probe passed'); }
  catch { storage = unavailable('Local storage is not writable'); }
  const [tts, stt, inventory] = await Promise.all([files([espeakPath()], 'Local speech synthesis'), files([whisperBinPath(), whisperModelPath()], 'Local transcription'), getModelInventory()]);
  let phones: Capability;
  try { const dir = ipaModelDir(); if (!dir) throw Error(); for (const file of phoneManifest.files) if ((await stat(path.join(dir, file.file))).size !== file.bytes) throw Error(); phones = available('Phone asset sizes match; hashes and native runtime are checked at inference'); }
  catch { phones = unavailable('Phone assets are missing or have invalid sizes'); }
  return { checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 5000).toISOString(), storage, tts, stt, phones,
    chat: inventory.ready ? available('Verified local completion model installed; execution may still fail') : unavailable(inventory.connected ? 'Install or select a verified local completion model' : inventory.error ?? 'Ollama unavailable'),
    resources: { cpuCount: os.availableParallelism(), freeMemoryBytes: os.freemem(), totalMemoryBytes: os.totalmem() } };
}
