import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import type { LanguageProfile, DictionaryEntry, GrammarRule, Sample, AudioClip } from 'shared/types'
import { useSessionLog } from './session-log-context'
import { apiFetch } from '@/services/api'
import { getSaveQueue } from './save-runtime'
import type { DraftValue } from 'shared/schemas/save-queue'
import type { SaveStatus } from './save-queue'

interface ProfileContextValue {
  profile: LanguageProfile | null
  loadProfile: (id: string) => Promise<void>
  createProfile: (data: { name: string; description: string; phonetic_notes: string; is_sandbox?: boolean }) => Promise<LanguageProfile>
  updateProfile: (updates: Partial<LanguageProfile>) => void
  /** Add a new entry; returns the generated id so callers can link it (e.g. an audio segment). */
  addDictionaryEntry: (entry: Omit<DictionaryEntry, 'id' | 'created_at'>) => string
  /** Re-insert a full entry verbatim (preserves id/created_at) — used to undo a delete. */
  addDictionaryEntryRaw: (entry: DictionaryEntry) => void
  updateDictionaryEntry: (id: string, updates: Partial<DictionaryEntry>) => void
  removeDictionaryEntry: (id: string) => void
  addSample: (sample: Omit<Sample, 'id' | 'created_at'>) => void
  updateSample: (id: string, updates: Partial<Sample>) => void
  removeSample: (id: string) => void
  addGrammarRule: (rule: Omit<GrammarRule, 'id' | 'created_at'>) => void
  updateGrammarRule: (id: string, updates: Partial<GrammarRule>) => void
  removeGrammarRule: (id: string) => void
  addAudioClip: (clip: Omit<AudioClip, 'id' | 'created_at'>) => string
  updateAudioClip: (id: string, updates: Partial<AudioClip>) => void
  removeAudioClip: (id: string) => void
  saveAudioSample: (profileId: string, sample: Sample, clip: AudioClip) => Promise<void>
  restoreSample: (profileId: string, sample: Sample, clip?: AudioClip) => void
  closeProfile: () => void
  saving: boolean
  saveStatus: SaveStatus
  pendingSaves: { id: string; name: string; phase: SaveStatus['phase']; durable: boolean; message?: string }[]
  retrySave: (id: string) => Promise<void>
  resolveSave: (id: string, keepLocal: boolean) => Promise<void>
  drafts: Record<string, DraftValue>
  setDraft: (key: string, value: DraftValue) => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function genId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export function ProfileProvider({
  children,
  onProfileChange,
}: {
  children: ReactNode
  onProfileChange?: (profile: LanguageProfile | null) => void
}) {
  const [profile, setProfile] = useState<LanguageProfile | null>(null)
  const [queue] = useState(getSaveQueue)
  const [, refresh] = useState(0)
  const [recoveryError, setRecoveryError] = useState('')
  const { addEntry } = useSessionLog()
  const profileRef = useRef(profile)
  const loadGeneration = useRef(0)

  useEffect(() => {
    const unsubscribe = queue.subscribe(() => {
      const id = profileRef.current?.id
      if (id) {
        const view = queue.view(id)
        if (view) { profileRef.current = view; setProfile(view) }
      }
      refresh(value => value + 1)
    })
    void queue.start().catch(error => setRecoveryError(`Draft recovery failed: ${(error as Error).message}. Stored drafts have been preserved.`))
    return unsubscribe
  }, [queue])

  useEffect(() => {
    onProfileChange?.(profile)
  }, [profile, onProfileChange])

  const updateAndSave = useCallback((updater: (prev: LanguageProfile) => LanguageProfile) => {
    const previous = profileRef.current
    if (!previous) return
    queue.edit(previous, updater(previous))
    const view = queue.view(previous.id)!
    profileRef.current = view; setProfile(view)
  }, [queue])

  const loadProfile = useCallback(async (id: string) => {
    const generation = ++loadGeneration.current
    const data = await queue.load(await apiFetch<LanguageProfile>(`/profiles/${encodeURIComponent(id)}`))
    if (generation !== loadGeneration.current) return
    profileRef.current = data; setProfile(data)
    addEntry('info', `Loaded profile: ${data.name}`)
  }, [addEntry, queue])

  const createProfile = useCallback(async (data: { name: string; description: string; phonetic_notes: string; is_sandbox?: boolean }) => {
    const created = await queue.load(await apiFetch<LanguageProfile>('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }))
    ++loadGeneration.current
    profileRef.current = created; setProfile(created)
    addEntry('success', `Created new profile: ${created.name}`)
    return created
  }, [addEntry, queue])

  const updateProfile = useCallback((updates: Partial<LanguageProfile>) => {
    updateAndSave(prev => ({ ...prev, ...updates }))
  }, [updateAndSave])

  const addDictionaryEntry = useCallback((entry: Omit<DictionaryEntry, 'id' | 'created_at'>): string => {
    const id = genId('word')
    const newEntry: DictionaryEntry = { ...entry, id, created_at: new Date().toISOString() }
    updateAndSave(prev => ({ ...prev, dictionary: [...prev.dictionary, newEntry] }))
    addEntry('success', `Mapped: "${entry.alien_word}" → "${entry.english_meaning}"`)
    return id
  }, [updateAndSave, addEntry])

  const addDictionaryEntryRaw = useCallback((entry: DictionaryEntry) => {
    updateAndSave(prev => ({ ...prev, dictionary: [...prev.dictionary, entry] }))
  }, [updateAndSave])

  const updateDictionaryEntry = useCallback((id: string, updates: Partial<DictionaryEntry>) => {
    updateAndSave(prev => ({
      ...prev,
      dictionary: prev.dictionary.map(e => e.id === id ? { ...e, ...updates } : e),
    }))
  }, [updateAndSave])

  const removeDictionaryEntry = useCallback((id: string) => {
    updateAndSave(prev => ({
      ...prev,
      dictionary: prev.dictionary.filter(e => e.id !== id),
      audio_clips: prev.audio_clips.map(clip => ({ ...clip, segments: clip.segments.map(segment =>
        segment.dictionary_entry_id === id ? { ...segment, dictionary_entry_id: null } : segment) })),
    }))
  }, [updateAndSave])

  const addSample = useCallback((sample: Omit<Sample, 'id' | 'created_at'>) => {
    const newSample: Sample = { ...sample, id: genId('sample'), created_at: new Date().toISOString() }
    updateAndSave(prev => ({ ...prev, samples: [...prev.samples, newSample] }))
    addEntry('info', `Added sample: "${sample.alien_text.slice(0, 50)}..."`)
  }, [updateAndSave, addEntry])

  const updateSample = useCallback((id: string, updates: Partial<Sample>) => {
    updateAndSave(prev => ({
      ...prev,
      samples: prev.samples.map(s => s.id === id ? { ...s, ...updates } : s),
    }))
  }, [updateAndSave])

  const removeSample = useCallback((id: string) => {
    // Keep shared clips and retain bytes until explicit garbage collection can
    // account for pending edits, conflicts and previous profile snapshots.
    const audioId = profileRef.current?.samples.find(s => s.id === id)?.audio_id ?? null
    updateAndSave(prev => ({
      ...prev,
      samples: prev.samples.filter(s => s.id !== id),
      audio_clips: audioId && !prev.samples.some(s => s.id !== id && s.audio_id === audioId)
        ? prev.audio_clips.filter(c => c.id !== audioId) : prev.audio_clips,
    }))
  }, [updateAndSave])

  const addGrammarRule = useCallback((rule: Omit<GrammarRule, 'id' | 'created_at'>) => {
    const newRule: GrammarRule = { ...rule, id: genId('rule'), created_at: new Date().toISOString() }
    updateAndSave(prev => ({ ...prev, grammar_rules: [...prev.grammar_rules, newRule] }))
    addEntry('success', `Grammar rule added: ${rule.rule}`)
  }, [updateAndSave, addEntry])

  const updateGrammarRule = useCallback((id: string, updates: Partial<GrammarRule>) => {
    updateAndSave(prev => ({
      ...prev,
      grammar_rules: prev.grammar_rules.map(r => r.id === id ? { ...r, ...updates } : r),
    }))
  }, [updateAndSave])

  const removeGrammarRule = useCallback((id: string) => {
    updateAndSave(prev => ({
      ...prev,
      grammar_rules: prev.grammar_rules.filter(r => r.id !== id),
    }))
  }, [updateAndSave])

  const addAudioClip = useCallback((clip: Omit<AudioClip, 'id' | 'created_at'>): string => {
    const id = genId('audio')
    const newClip: AudioClip = { ...clip, id, created_at: new Date().toISOString() }
    updateAndSave(prev => ({ ...prev, audio_clips: [...(prev.audio_clips || []), newClip] }))
    addEntry('success', `Audio clip added (${clip.duration.toFixed(1)}s)`)
    return id
  }, [updateAndSave, addEntry])

  const updateAudioClip = useCallback((id: string, updates: Partial<AudioClip>) => {
    updateAndSave(prev => ({
      ...prev,
      audio_clips: (prev.audio_clips || []).map(c => c.id === id ? { ...c, ...updates } : c),
    }))
  }, [updateAndSave])

  const removeAudioClip = useCallback((id: string) => {
    updateAndSave(prev => ({
      ...prev,
      audio_clips: (prev.audio_clips || []).filter(c => c.id !== id),
      // Also unlink from any samples
      samples: prev.samples.map(s => s.audio_id === id ? { ...s, audio_id: null } : s),
    }))
    // Bytes remain available if this edit fails or the saved version is restored.
    addEntry('info', 'Audio clip removed')
  }, [updateAndSave, addEntry])

  const closeProfile = useCallback(() => {
    ++loadGeneration.current
    profileRef.current = null; setProfile(null)
    addEntry('info', 'Profile closed')
  }, [addEntry])

  const saveAudioSample = useCallback(async (id: string, sample: Sample, clip: AudioClip) => {
    const before = queue.view(id)
    if (!before) throw new Error('Profile is not loaded')
    const existingSample = before.samples.find(entry => entry.id === sample.id)
    const existingClip = before.audio_clips.find(entry => entry.id === clip.id)
    queue.edit(before, { ...before,
      samples: [...before.samples.filter(entry => entry.id !== sample.id), { ...sample, created_at: existingSample?.created_at ?? sample.created_at }],
      audio_clips: [...before.audio_clips.filter(entry => entry.id !== clip.id), { ...clip, created_at: existingClip?.created_at ?? clip.created_at }],
    })
    await queue.retry(id)
    if (queue.status(id).phase !== 'saved' || !queue.status(id).durable) throw new Error('Audio sample is pending. Resolve the save error or retry; the original is retained.')
  }, [queue])
  const restoreSample = useCallback((id: string, sample: Sample, clip?: AudioClip) => {
    const previous = queue.view(id)
    if (!previous) return
    queue.edit(previous, { ...previous, samples: [...previous.samples.filter(entry => entry.id !== sample.id), sample],
      audio_clips: clip ? [...previous.audio_clips.filter(entry => entry.id !== clip.id), clip] : previous.audio_clips })
  }, [queue])

  const setDraft = useCallback((key: string, value: DraftValue) => {
    if (profileRef.current) queue.setDraft(profileRef.current.id, key, value)
  }, [queue])
  const saveStatus = profile ? queue.status(profile.id) : { phase: 'saved' as const, durable: true }

  return (
    <ProfileContext.Provider value={{
      profile,
      loadProfile,
      createProfile,
      updateProfile,
      addDictionaryEntry,
      addDictionaryEntryRaw,
      updateDictionaryEntry,
      removeDictionaryEntry,
      addSample,
      updateSample,
      removeSample,
      addGrammarRule,
      updateGrammarRule,
      removeGrammarRule,
      addAudioClip,
      updateAudioClip,
      removeAudioClip,
      saveAudioSample,
      restoreSample,
      closeProfile,
      saving: saveStatus.phase === 'saving',
      saveStatus,
      pendingSaves: queue.pending(),
      retrySave: id => queue.retry(id),
      resolveSave: (id, keepLocal) => queue.resolve(id, keepLocal),
      drafts: profile ? queue.drafts(profile.id) : {},
      setDraft,
    }}>
      {recoveryError && <div role="alert" style={{ background: '#321b1b', color: '#fff', padding: 12 }}>{recoveryError}</div>}
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
