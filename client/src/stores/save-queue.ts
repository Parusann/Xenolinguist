import type { LanguageProfile } from 'shared/types'
import type { ProfileMutation } from 'shared/schemas/mutations'
import { parseProfile } from 'shared/schemas/profile'
import { saveQueueRecordSchema, type SaveQueueRecord, type DraftValue } from 'shared/schemas/save-queue'
import { diffOperations, rebaseChanges, validateView } from './profile-changes'
import type { DraftStore } from './draft-store'

export interface QueueApi {
  get(id: string): Promise<LanguageProfile>
  mutate(id: string, mutation: ProfileMutation): Promise<{ profile: LanguageProfile; mutationId: string }>
}
export interface SaveStatus { phase: 'saved' | 'pending' | 'saving' | 'failed' | 'conflict'; durable: boolean; message?: string }
interface State { record: SaveQueueRecord; status: SaveStatus; writes: Promise<void>; busy?: Promise<void>; timer?: ReturnType<typeof setTimeout> }
const codeOf = (error: unknown) => (error as { code?: string })?.code

export class SaveQueue {
  private states = new Map<string, State>()
  private initializing?: Promise<void>
  private listeners = new Set<() => void>()
  private api: QueueApi
  private store: DraftStore
  private delay: number
  constructor(api: QueueApi, store: DraftStore, delay = 500) { this.api = api; this.store = store; this.delay = delay }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private notify() { for (const listener of this.listeners) listener() }
  private make(record: SaveQueueRecord): State { return { record, status: { phase: record.batches.length ? 'pending' : 'saved', durable: true }, writes: Promise.resolve() } }
  start(): Promise<void> {
    return this.initializing ??= (async () => {
      for (const saved of await this.store.list()) {
        if (!this.states.has(saved.profileId)) this.states.set(saved.profileId, this.make(saveQueueRecordSchema.parse(saved)))
      }
      this.notify()
      for (const [id, state] of this.states) if (state.record.batches.length) this.schedule(id)
    })()
  }
  async load(profile: LanguageProfile) {
    await this.start()
    const fresh = parseProfile(profile)
    let state = this.states.get(fresh.id)
    if (!state) { state = this.make({ profileId: fresh.id, base: fresh, batches: [], drafts: {} }); this.states.set(fresh.id, state) }
    else if (fresh.revision >= state.record.base.revision) state.record.base = fresh
    this.notify()
    return this.view(fresh.id)!
  }
  view(id: string): LanguageProfile | undefined {
    const state = this.states.get(id)
    if (!state) return
    let profile = state.record.base
    for (const batch of state.record.batches) profile = rebaseChanges(batch.before, batch.after, profile).profile
    return profile
  }
  drafts(id: string) { return this.states.get(id)?.record.drafts ?? {} }
  status(id: string): SaveStatus { return this.states.get(id)?.status ?? { phase: 'saved', durable: true } }
  pending() { return [...this.states].filter(([, state]) => state.status.phase !== 'saved' || !state.status.durable).map(([id, state]) => ({ id, name: state.record.base.name, ...state.status })) }
  private persist(state: State): Promise<void> {
    const snapshot = structuredClone(state.record)
    state.status = { ...state.status, durable: false }
    const write = state.writes.catch(() => {}).then(() => this.store.put(snapshot))
    state.writes = write
    void write.then(() => {
      if (state.writes === write) { state.status = { ...state.status, durable: true }; this.notify() }
    }, error => { state.status = { phase: 'failed', durable: false, message: `Local draft storage failed: ${(error as Error).message}` }; this.notify() })
    return write
  }
  edit(before: LanguageProfile, after: LanguageProfile) {
    const state = this.states.get(before.id)
    if (!state) throw new Error('Profile queue has not loaded')
    const checked = validateView(after)
    if (!diffOperations(before, checked).length) return
    const last = state.record.batches.at(-1)
    // Coalesce the unsent tail only. A sealed in-flight request is never rewritten.
    if (last && !last.sent) last.after = checked
    else state.record.batches.push({ id: crypto.randomUUID(), before: structuredClone(before), after: checked })
    state.status = { phase: 'pending', durable: false }
    void this.persist(state).catch(() => {})
    this.schedule(before.id)
    this.notify()
  }
  setDraft(id: string, key: string, value: DraftValue) {
    const state = this.states.get(id)
    if (!state) return
    state.record.drafts[key] = value
    void this.persist(state).catch(() => {})
    this.notify()
  }
  private schedule(id: string) {
    const state = this.states.get(id)!
    clearTimeout(state.timer)
    state.timer = setTimeout(() => { void this.pump(id) }, this.delay)
  }
  async retry(id: string) {
    const state = this.states.get(id)
    if (!state) return
    try { await this.persist(state); await this.pump(id) } catch { /* status retains the error */ }
  }
  async resolve(id: string, keepLocal: boolean) {
    const state = this.states.get(id)
    if (!state || state.busy) return
    if (!keepLocal) state.record.batches = []
    else {
      let base = state.record.base
      for (const batch of state.record.batches) {
        const merged = rebaseChanges(batch.before, batch.after, base).profile
        batch.before = base; batch.after = merged; batch.sent = undefined; batch.id = crypto.randomUUID(); base = merged
      }
    }
    state.status = { phase: state.record.batches.length ? 'pending' : 'saved', durable: false }
    await this.persist(state)
    this.notify()
    await this.pump(id)
  }
  async flush(): Promise<boolean> {
    try {
      await this.start()
      for (const state of this.states.values()) clearTimeout(state.timer)
      await Promise.all([...this.states.keys()].map(id => this.pump(id)))
      await Promise.all([...this.states.values()].map(state => state.writes))
      return [...this.states.values()].every(state => !state.record.batches.length && state.status.durable)
    } catch { return false }
  }
  private pump(id: string): Promise<void> {
    const state = this.states.get(id)!
    if (state.busy) return state.busy
    state.busy = this.run(state).finally(() => { state.busy = undefined })
    return state.busy
  }
  private async run(state: State) {
    try {
      await state.writes
      let rebases = 0
      while (state.record.batches.length) {
        const batch = state.record.batches[0]
        if (!batch.sent) {
          const merged = rebaseChanges(batch.before, batch.after, state.record.base)
          if (merged.conflicts.length) {
            state.status = { phase: 'conflict', durable: true, message: `Conflicting edits: ${merged.conflicts.join(', ')}` }; this.notify(); return
          }
          const operations = diffOperations(state.record.base, validateView(merged.profile))
          if (!operations.length) { state.record.batches.shift(); await this.persist(state); continue }
          batch.sent = { mutationId: batch.id, expectedRevision: state.record.base.revision, operations }
          await this.persist(state)
        }
        state.status = { phase: 'saving', durable: true }; this.notify()
        try {
          const response = await this.api.mutate(state.record.profileId, batch.sent)
          if (response.mutationId !== batch.id) throw new Error('Server acknowledged a different mutation')
          const profile = parseProfile(response.profile)
          if (profile.id !== state.record.profileId) throw new Error('Server returned a different profile')
          if (profile.revision <= batch.sent.expectedRevision) throw new Error('Server did not acknowledge a newer profile revision')
          if (profile.revision >= state.record.base.revision) state.record.base = profile
          state.record.batches.shift()
          await this.persist(state)
          rebases = 0
          this.notify()
        } catch (error) {
          if (codeOf(error) !== 'REVISION_CONFLICT' || ++rebases > 3) throw error
          state.record.base = parseProfile(await this.api.get(state.record.profileId))
          batch.sent = undefined
          await this.persist(state)
        }
      }
      state.status = { phase: 'saved', durable: true }; this.notify()
    } catch (error) {
      state.status = { phase: 'failed', durable: state.status.durable, message: (error as Error).message }; this.notify()
    }
  }
}
