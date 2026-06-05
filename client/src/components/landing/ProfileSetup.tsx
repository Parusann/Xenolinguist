import { useState } from 'react'
import { useProfile } from '@/stores/profile-context'
import { VantaTopology } from '@/components/common/VantaTopology'
import { XenoMark } from '@/components/common/XenoMark'

interface ProfileSetupProps {
  mode: 'new' | 'sandbox'
  onBack: () => void
}

export function ProfileSetup({ mode, onBack }: ProfileSetupProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [phoneticNotes, setPhoneticNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const { createProfile } = useProfile()

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    await createProfile({
      name: name.trim(),
      description: description.trim(),
      phonetic_notes: phoneticNotes.trim(),
      is_sandbox: mode === 'sandbox',
    })
  }

  const isSandbox = mode === 'sandbox'
  const accent = isSandbox ? 'var(--ai)' : 'var(--accent)'
  const disabled = !name.trim() || creating

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-deep)' }}>
      {/* Same ambient backdrop as the landing, for a seamless transition */}
      <VantaTopology opacity={0.85} style={{ zIndex: 1, pointerEvents: 'none' }} />
      <div
        className="app-bg show-grid"
        style={{ zIndex: 2, background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(0,230,118,0.04), transparent 60%)' }}
      />

      <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="animate-fade-in-up" style={{ width: 460, maxWidth: '92vw' }}>
          {/* Back */}
          <button
            onClick={onBack}
            className="kicker"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-mute)', padding: 0, marginBottom: 26 }}
          >
            ← Back
          </button>

          {/* Heading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <XenoMark size={34} />
            <h2 className="h-display" style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em' }}>
              {isSandbox ? 'Sandbox ' : 'New '}
              <span style={{ color: accent, fontWeight: 500 }}>{isSandbox ? 'Setup' : 'Profile'}</span>
            </h2>
          </div>
          <p style={{ fontSize: 13, color: 'var(--fg-mute)', margin: '0 0 26px', lineHeight: 1.5 }}>
            {isSandbox
              ? 'The AI will generate a language with hidden rules for you to decode.'
              : 'Name and describe the language you want to decode.'}
          </p>

          {/* Form card */}
          <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label className="label">Language Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                placeholder={isSandbox ? 'e.g., Mystery Language' : 'e.g., Eridian, Signal-7'}
                className="input"
                autoFocus
              />
            </div>

            <div>
              <label className="label">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Origin, context, any known properties..."
                rows={3}
                className="textarea"
              />
            </div>

            <div>
              <label className="label">Phonetic Notes</label>
              <input
                type="text"
                value={phoneticNotes}
                onChange={(e) => setPhoneticNotes(e.target.value)}
                placeholder="e.g., tonal, clicking sounds, musical chords"
                className="input"
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={disabled}
              className="btn primary"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '11px 14px',
                marginTop: 2,
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                ...(isSandbox
                  ? {
                      background: 'linear-gradient(180deg, var(--ai-soft), oklch(0.74 0.16 285 / 0.08))',
                      borderColor: 'oklch(0.74 0.16 285 / 0.5)',
                      color: '#e7defc',
                    }
                  : {}),
              }}
            >
              {creating ? 'Creating…' : isSandbox ? 'Generate & Start' : 'Begin Decoding'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
