import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import type { LanguageProfile, DictionaryEntry, GrammarRule, Sample, AudioClip } from 'shared/types'
import { useSessionLog } from './session-log-context'

interface ProfileContextValue {
  profile: LanguageProfile | null
  loadProfile: (id: string) => Promise<void>
  createProfile: (data: { name: string; description: string; phonetic_notes: string; is_sandbox?: boolean }) => Promise<LanguageProfile>
  updateProfile: (updates: Partial<LanguageProfile>) => void
  addDictionaryEntry: (entry: Omit<DictionaryEntry, 'id' | 'created_at'>) => void
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
  closeProfile: () => void
  saving: boolean
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

let idCounter = 0
function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${++idCounter}`
}

export function ProfileProvider({
  children,
  onProfileChange,
}: {
  children: ReactNode
  onProfileChange?: (profile: LanguageProfile | null) => void
}) {
  const [profile, setProfile] = useState<LanguageProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const { addEntry } = useSessionLog()
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const profileRef = useRef(profile)
  profileRef.current = profile

  useEffect(() => {
    onProfileChange?.(profile)
  }, [profile, onProfileChange])

  const persistProfile = useCallback((updated: LanguageProfile) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      setSaving(true)
      try {
        await fetch(`/api/profiles/${updated.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        })
      } catch (err) {
        console.error('Failed to save profile:', err)
      }
      setSaving(false)
    }, 500)
  }, [])

  const updateAndSave = useCallback((updater: (prev: LanguageProfile) => LanguageProfile) => {
    setProfile(prev => {
      if (!prev) return prev
      const updated = updater(prev)
      persistProfile(updated)
      return updated
    })
  }, [persistProfile])

  const loadProfile = useCallback(async (id: string) => {
    const res = await fetch(`/api/profiles/${id}`)
    const data = await res.json()
    setProfile(data)
    addEntry('info', `Loaded profile: ${data.name}`)
  }, [addEntry])

  const createProfile = useCallback(async (data: { name: string; description: string; phonetic_notes: string; is_sandbox?: boolean }) => {
    const res = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const created: LanguageProfile = await res.json()
    setProfile(created)
    addEntry('success', `Created new profile: ${created.name}`)
    return created
  }, [addEntry])

  const updateProfile = useCallback((updates: Partial<LanguageProfile>) => {
    updateAndSave(prev => ({ ...prev, ...updates }))
  }, [updateAndSave])

  const addDictionaryEntry = useCallback((entry: Omit<DictionaryEntry, 'id' | 'created_at'>) => {
    const newEntry: DictionaryEntry = { ...entry, id: genId('word'), created_at: new Date().toISOString() }
    updateAndSave(prev => ({ ...prev, dictionary: [...prev.dictionary, newEntry] }))
    addEntry('success', `Mapped: "${entry.alien_word}" → "${entry.english_meaning}"`)
  }, [updateAndSave, addEntry])

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
    updateAndSave(prev => ({
      ...prev,
      samples: prev.samples.filter(s => s.id !== id),
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
    // Delete from server
    fetch(`/api/audio/${id}`, { method: 'DELETE' }).catch(() => {})
    addEntry('info', 'Audio clip removed')
  }, [updateAndSave, addEntry])

  const closeProfile = useCallback(() => {
    setProfile(null)
    addEntry('info', 'Profile closed')
  }, [addEntry])

  return (
    <ProfileContext.Provider value={{
      profile,
      loadProfile,
      createProfile,
      updateProfile,
      addDictionaryEntry,
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
      closeProfile,
      saving,
    }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
