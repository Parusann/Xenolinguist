import { audioDraftMetadataSchema, MAX_AUDIO_BYTES, type AudioDraftMetadata } from 'shared/schemas/audio'
export interface AudioDraft { metadata: AudioDraftMetadata; blob: Blob }
interface Bridge {
  readAudioDraft: (id: string) => Promise<{ metadata: unknown; bytes: Uint8Array } | null>
  writeAudioDraft: (id: string, record: { metadata: AudioDraftMetadata; bytes: Uint8Array }) => Promise<void>
  removeAudioDraft: (id: string) => Promise<void>
}
const desktop = (window as unknown as { xeno?: Bridge }).xeno
let connection: Promise<IDBDatabase> | undefined
const open = () => connection ??= new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('xenolinguist-audio-drafts', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('audio')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
  request.onblocked = () => reject(new Error('Audio draft storage is blocked by another window'))
})
async function transaction(id: string, mode: 'read' | 'put' | 'delete', value?: AudioDraft): Promise<AudioDraft | null> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', mode === 'read' ? 'readonly' : 'readwrite', { durability: 'strict' })
    const store = tx.objectStore('audio')
    const request = mode === 'read' ? store.get(id) : mode === 'put' ? store.put(value, id) : store.delete(id)
    tx.oncomplete = () => resolve(mode === 'read' ? request.result ?? null : null)
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Audio draft storage failed'))
  })
}
const writes = new Map<string, Promise<unknown>>()
const undurable = new Set<string>()
function enqueue(id: string, action: () => Promise<unknown>) {
  undurable.add(id)
  const next = (writes.get(id) ?? Promise.resolve()).catch(() => {}).then(action)
  writes.set(id, next)
  void next.then(() => { if (writes.get(id) === next) undurable.delete(id) }, () => {})
  return next
}
export const audioDraftStore = {
  async load(id: string): Promise<AudioDraft | null> {
    await writes.get(id)?.catch(() => {})
    const raw = desktop?.readAudioDraft ? await desktop.readAudioDraft(id) : await transaction(id, 'read')
    if (!raw) return null
    const metadata = audioDraftMetadataSchema.parse(raw.metadata)
    if (metadata.profileId !== id) throw new Error('Audio draft identity mismatch')
    const blob = 'bytes' in raw ? new Blob([new Uint8Array(raw.bytes)], { type: metadata.mime }) : raw.blob
    if (!(blob instanceof Blob) || !blob.size || blob.size > MAX_AUDIO_BYTES) throw new Error('Audio draft size is invalid')
    return { metadata, blob }
  },
  put(draft: AudioDraft) {
    const metadata = audioDraftMetadataSchema.parse(draft.metadata)
    if (!draft.blob.size || draft.blob.size > MAX_AUDIO_BYTES) return Promise.reject(new Error('Audio draft exceeds 32 MiB'))
    return enqueue(metadata.profileId, async () => {
      if (desktop?.writeAudioDraft) await desktop.writeAudioDraft(metadata.profileId, { metadata, bytes: new Uint8Array(await draft.blob.arrayBuffer()) })
      else await transaction(metadata.profileId, 'put', { metadata, blob: draft.blob })
    })
  },
  remove(id: string) { return enqueue(id, () => desktop?.removeAudioDraft ? desktop.removeAudioDraft(id) : transaction(id, 'delete')) },
}
let activePreparations = 0
export function beginAudioPreparation() { activePreparations++; return () => { activePreparations-- } }
export const hasUndurableAudio = () => undurable.size > 0 || activePreparations > 0
export async function flushAudioDrafts() { await Promise.allSettled(writes.values()); return !hasUndurableAudio() }
