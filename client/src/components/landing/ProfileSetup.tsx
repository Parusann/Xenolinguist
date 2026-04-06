import { useState } from 'react'
import { useProfile } from '@/stores/profile-context'

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

  return (
    <div className="h-screen relative overflow-hidden flex items-center justify-center">
      {/* Background grid */}
      <div className="fixed inset-0 z-0" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
        maskImage: 'radial-gradient(ellipse at 50% 50%, black 20%, transparent 70%)',
      }} />

      <div className="relative z-10 max-w-md w-full px-8 animate-fade-in-up">
        <button onClick={onBack} className="btn-ghost text-xs mb-8">← Back</button>

        <h2 className="text-2xl font-light text-white mb-1">
          {mode === 'sandbox' ? 'Sandbox' : 'New'} <span className="text-accent font-medium">{mode === 'sandbox' ? 'Setup' : 'Profile'}</span>
        </h2>
        <p className="text-sm text-gray-500 mb-8">
          {mode === 'sandbox'
            ? 'The AI will generate a language for you to decode.'
            : 'Name and describe the language you want to decode.'}
        </p>

        <div className="glass-card rounded-xl p-6 space-y-5">
          <div>
            <label className="label">Language Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'sandbox' ? 'e.g., Mystery Language' : 'e.g., Eridian, Signal-7'}
              className="input w-full"
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
              className="input w-full resize-none"
            />
          </div>

          <div>
            <label className="label">Phonetic Notes</label>
            <input
              type="text"
              value={phoneticNotes}
              onChange={(e) => setPhoneticNotes(e.target.value)}
              placeholder="e.g., tonal, clicking sounds, musical chords"
              className="input w-full"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="btn-primary w-full py-3"
          >
            {creating ? 'Creating...' : mode === 'sandbox' ? 'Generate & Start' : 'Begin Decoding'}
          </button>
        </div>
      </div>
    </div>
  )
}
