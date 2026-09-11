import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SaveQueue, type QueueApi } from './save-queue'
import type { DraftStore } from './draft-store'
import type { SaveQueueRecord } from 'shared/schemas/save-queue'
import type { LanguageProfile } from 'shared/types'
import { createDefaultProfile } from 'shared/constants'
import { parseProfile } from 'shared/schemas/profile'
import { applyOperations } from 'shared/profile-operations'

const clone = <T,>(value: T): T => structuredClone(value)
function profile(id = 'test'): LanguageProfile {
  return parseProfile({ ...createDefaultProfile(), id, name: id, created_at: '2026-06-07T00:00:00Z', updated_at: '2026-06-07T00:00:00Z' })
}
class MemoryStore implements DraftStore {
  values = new Map<string, SaveQueueRecord>()
  fail = false
  async list() { return [...this.values.values()].map(clone) }
  async put(record: SaveQueueRecord) { if (this.fail) throw new Error('quota exceeded'); this.values.set(record.profileId, clone(record)) }
}
function backend(...profiles: LanguageProfile[]) {
  const data = new Map(profiles.map(p => [p.id, clone(p)]))
  const applied = new Set<string>()
  const api: QueueApi = {
    get: vi.fn(async id => clone(data.get(id)!)),
    mutate: vi.fn(async (id, mutation) => {
      const current = data.get(id)!
      if (!applied.has(mutation.mutationId)) {
        if (current.revision !== mutation.expectedRevision) throw Object.assign(new Error('stale'), { code: 'REVISION_CONFLICT' })
        data.set(id, parseProfile({ ...applyOperations(current, mutation.operations), revision: current.revision + 1 }))
        applied.add(mutation.mutationId)
      }
      return { profile: clone(data.get(id)!), mutationId: mutation.mutationId }
    }),
  }
  return { api, data, applied }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('durable save queue', () => {
  it('coalesces unsent edits without cancelling another profile', async () => {
    const a = profile('a'), b = profile('b'), store = new MemoryStore(), remote = backend(a, b)
    const queue = new SaveQueue(remote.api, store, 60_000)
    await queue.load(a); await queue.load(b)
    queue.edit(a, { ...a, description: 'first' })
    queue.edit(queue.view('a')!, { ...queue.view('a')!, description: 'latest', phonetic_notes: 'retained' })
    queue.edit(b, { ...b, description: 'other profile' })
    expect(await queue.flush()).toBe(true)
    expect(remote.api.mutate).toHaveBeenCalledTimes(2)
    expect(remote.data.get('a')).toMatchObject({ description: 'latest', phonetic_notes: 'retained' })
    expect(remote.data.get('b')?.description).toBe('other profile')
  })

  it('keeps edits typed while an earlier request is in flight', async () => {
    const a = profile(), store = new MemoryStore(), remote = backend(a)
    const send = remote.api.mutate
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    remote.api.mutate = vi.fn(async (id, mutation) => { await gate; return send(id, mutation) })
    const queue = new SaveQueue(remote.api, store, 60_000)
    await queue.load(a)
    queue.edit(a, { ...a, description: 'first' })
    const flushing = queue.flush()
    await vi.waitFor(() => expect(remote.api.mutate).toHaveBeenCalledTimes(1))
    queue.edit(queue.view(a.id)!, { ...queue.view(a.id)!, phonetic_notes: 'typed during save' })
    release()
    expect(await flushing).toBe(true)
    expect(queue.view(a.id)).toMatchObject({ description: 'first', phonetic_notes: 'typed during save', revision: 2 })
    expect(remote.data.get(a.id)?.phonetic_notes).toBe('typed during save')
  })

  it('replays the same sealed mutation after a lost response and reload', async () => {
    const a = profile(), store = new MemoryStore(), remote = backend(a)
    const send = remote.api.mutate
    remote.api.mutate = vi.fn(async (id, mutation) => { await send(id, mutation); throw new Error('connection lost after commit') })
    const queue = new SaveQueue(remote.api, store, 60_000)
    await queue.load(a); queue.edit(a, { ...a, description: 'exactly once' })
    expect(await queue.flush()).toBe(false)
    const sealed = clone(store.values.get(a.id)!.batches[0].sent)
    expect(queue.status(a.id)).toMatchObject({ phase: 'failed', durable: true })
    remote.api.mutate = send
    const restored = new SaveQueue(remote.api, store, 60_000)
    expect(await restored.flush()).toBe(true)
    expect(remote.data.get(a.id)?.revision).toBe(1)
    expect(remote.applied.size).toBe(1)
    expect(send).toHaveBeenLastCalledWith(a.id, sealed)
  })

  it('rebases an independent field after a 409 without replacing remote work', async () => {
    const a = profile(), store = new MemoryStore(), remote = backend(a)
    const queue = new SaveQueue(remote.api, store, 60_000)
    await queue.load(a)
    remote.data.set(a.id, { ...a, revision: 1, description: 'remote description' })
    queue.edit(a, { ...a, phonetic_notes: 'local notes' })
    expect(await queue.flush()).toBe(true)
    expect(remote.data.get(a.id)).toMatchObject({ description: 'remote description', phonetic_notes: 'local notes', revision: 2 })
  })

  it('retains a pending edit when an acknowledgment contains no committed revision', async () => {
    const a = profile(), store = new MemoryStore(), remote = backend(a)
    const send = remote.api.mutate
    remote.api.mutate = vi.fn(async (_id, mutation) => ({ profile: clone(a), mutationId: mutation.mutationId }))
    const queue = new SaveQueue(remote.api, store, 60_000)
    await queue.load(a)
    queue.edit(a, { ...a, description: 'must remain pending' })
    expect(await queue.flush()).toBe(false)
    expect(store.values.get(a.id)?.batches).toHaveLength(1)
    expect(queue.status(a.id)).toMatchObject({ phase: 'failed', durable: true })
    remote.api.mutate = send
    await queue.retry(a.id)
    expect(remote.data.get(a.id)).toMatchObject({ revision: 1, description: 'must remain pending' })
  })

  it('requires a deliberate choice for conflicting edits to the same field', async () => {
    const a = profile(), store = new MemoryStore(), remote = backend(a)
    const queue = new SaveQueue(remote.api, store, 60_000)
    await queue.load(a)
    remote.data.set(a.id, { ...a, revision: 1, description: 'remote', phonetic_notes: 'independent remote' })
    queue.edit(a, { ...a, description: 'local' })
    expect(await queue.flush()).toBe(false)
    expect(queue.status(a.id).phase).toBe('conflict')
    expect(remote.data.get(a.id)?.description).toBe('remote')
    await queue.resolve(a.id, true)
    expect(remote.data.get(a.id)).toMatchObject({ description: 'local', phonetic_notes: 'independent remote', revision: 2 })
  })

  it('can discard pending edits in favor of the saved version', async () => {
    const a = profile(), store = new MemoryStore(), remote = backend(a)
    const queue = new SaveQueue(remote.api, store, 60_000)
    await queue.load(a)
    remote.data.set(a.id, { ...a, revision: 1, description: 'remote' })
    queue.edit(a, { ...a, description: 'local' })
    await queue.flush(); await queue.resolve(a.id, false)
    expect(queue.view(a.id)?.description).toBe('remote')
    expect(store.values.get(a.id)?.batches).toEqual([])
  })

  it('does not send edits before local storage succeeds and retains them for retry', async () => {
    const a = profile(), store = new MemoryStore(), remote = backend(a)
    const queue = new SaveQueue(remote.api, store, 60_000)
    await queue.load(a); store.fail = true
    queue.edit(a, { ...a, description: 'recoverable in memory' })
    expect(await queue.flush()).toBe(false)
    expect(remote.api.mutate).not.toHaveBeenCalled()
    expect(queue.status(a.id)).toMatchObject({ phase: 'failed', durable: false })
    store.fail = false
    await queue.retry(a.id)
    expect(remote.data.get(a.id)?.description).toBe('recoverable in memory')
    expect(queue.status(a.id)).toMatchObject({ phase: 'saved', durable: true })
  })

  it('persists translation drafts independently for each profile', async () => {
    const a = profile('a'), b = profile('b'), store = new MemoryStore(), remote = backend(a, b)
    const queue = new SaveQueue(remote.api, store, 60_000)
    await queue.load(a); await queue.load(b)
    queue.setDraft('a', 'translation.alien', 'nesh tor')
    queue.setDraft('b', 'translation.alien', 'other language')
    expect(await queue.flush()).toBe(true)
    const restored = new SaveQueue(remote.api, store, 60_000)
    await restored.start()
    expect(restored.drafts('a')['translation.alien']).toBe('nesh tor')
    expect(restored.drafts('b')['translation.alien']).toBe('other language')
    expect(remote.api.mutate).not.toHaveBeenCalled()
  })
})
