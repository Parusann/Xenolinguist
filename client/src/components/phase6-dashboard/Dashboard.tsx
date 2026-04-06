import { useRef } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useSessionLog } from '@/stores/session-log-context'
import { useToast } from '@/stores/toast-context'
import { getConfidenceLevel } from 'shared/constants'
import type { LanguageProfile } from 'shared/types'

export function Dashboard() {
  const { profile, updateProfile } = useProfile()
  const { entries } = useSessionLog()
  const { addToast } = useToast()
  const importRef = useRef<HTMLInputElement>(null)

  if (!profile) return null

  const dictionary = profile.dictionary
  const totalWords = dictionary.length
  const confirmed = dictionary.filter(e => getConfidenceLevel(e.confidence) === 'confirmed').length
  const probable = dictionary.filter(e => getConfidenceLevel(e.confidence) === 'probable').length
  const unknown = dictionary.filter(e => getConfidenceLevel(e.confidence) === 'unknown').length
  const avgConfidence = totalWords > 0
    ? Math.round(dictionary.reduce((sum, e) => sum + e.confidence, 0) / totalWords)
    : 0
  const grammarRules = profile.grammar_rules.length
  const totalSamples = profile.samples.length
  const decodedSamples = profile.samples.filter(s => s.decoded).length
  const numbersMapped = Object.keys(profile.number_system.mappings).length

  const dictionaryScore = Math.min(totalWords / 50, 1) * 30
  const grammarScore = Math.min(grammarRules / 5, 1) * 25
  const numbersScore = Math.min(numbersMapped / 10, 1) * 15
  const samplesScore = Math.min(totalSamples / 10, 1) * 15
  const confidenceScore = (avgConfidence / 100) * 15
  const progress = Math.round(dictionaryScore + grammarScore + numbersScore + samplesScore + confidenceScore)

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${profile.name.replace(/\s+/g, '-').toLowerCase()}-profile.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result as string) as Partial<LanguageProfile>
        // Merge imported data into current profile
        const updates: Partial<LanguageProfile> = {}
        if (imported.dictionary?.length) updates.dictionary = imported.dictionary
        if (imported.grammar_rules?.length) updates.grammar_rules = imported.grammar_rules
        if (imported.samples?.length) updates.samples = imported.samples
        if (imported.number_system) updates.number_system = imported.number_system
        if (imported.audio_clips) updates.audio_clips = imported.audio_clips
        updateProfile(updates)
      } catch {
        addToast('Invalid profile JSON file', 'error')
      }
    }
    reader.readAsText(file)
    if (importRef.current) importRef.current.value = ''
  }

  const handleExportCSV = () => {
    const header = 'Alien Word,English,Part of Speech,Confidence,Context\n'
    const rows = dictionary.map(e =>
      `"${e.alien_word}","${e.english_meaning}","${e.part_of_speech}",${e.confidence},"${e.context}"`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${profile.name.replace(/\s+/g, '-').toLowerCase()}-dictionary.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasTimeline = entries.filter(e => e.type === 'success').length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-light mb-1 text-chrome">
            <span className="font-medium text-chrome-accent">Dashboard</span>
          </h2>
          <p className="text-xs text-gray-500">Overview for "{profile.name}"</p>
        </div>
        <div className="flex gap-3">
          <label className="btn-ghost text-xs cursor-pointer">
            Import
            <input
              ref={importRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <button onClick={handleExport} className="btn-primary text-xs">
            Export JSON
          </button>
          <button onClick={handleExportCSV} disabled={!totalWords} className="btn-ghost text-xs">
            Export CSV
          </button>
        </div>
      </div>

      {/* Top row: Progress ring + stats + confidence all side by side */}
      <div className="grid grid-cols-4 gap-4 items-start stagger-children">
        {/* Progress ring — compact */}
        <div className="glass-card rounded-xl p-5 border-trace flex flex-col items-center">
          <div className="relative w-24 h-24 flex-shrink-0">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="6" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke="url(#progressGrad)" strokeWidth="6"
                strokeDasharray={`${progress * 2.64} 264`}
                strokeLinecap="round"
                className="transition-all duration-1000"
                style={{ filter: 'drop-shadow(0 0 6px rgba(0,230,118,0.3))' }}
              />
              <defs>
                <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00E676" />
                  <stop offset="100%" stopColor="#00A854" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-accent text-glow animate-text-glow-pulse">{progress}</span>
              <span className="text-[9px] text-gray-500 font-mono">PERCENT</span>
            </div>
          </div>
          <div className="w-full mt-4 space-y-2">
            <ProgressRow label="Vocab" value={Math.round(dictionaryScore / 30 * 100)} />
            <ProgressRow label="Grammar" value={Math.round(grammarScore / 25 * 100)} />
            <ProgressRow label="Numbers" value={Math.round(numbersScore / 15 * 100)} />
            <ProgressRow label="Samples" value={Math.round(samplesScore / 15 * 100)} />
          </div>
        </div>

        {/* Stats — 2x2 grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Words" value={totalWords} sub={`${confirmed} confirmed`} accent />
          <StatCard label="Grammar" value={grammarRules} sub="rules" />
          <StatCard label="Samples" value={totalSamples} sub={`${decodedSamples} decoded`} />
          <StatCard label="Numbers" value={numbersMapped} sub="mapped" />
        </div>

        {/* Confidence breakdown */}
        <div className="glass-card rounded-xl p-5">
          <label className="label mb-3">Confidence</label>
          <div className="space-y-3">
            <ConfBar label="Confirmed" count={confirmed} total={totalWords} color="bg-emerald-400" textColor="text-emerald-400" />
            <ConfBar label="Probable" count={probable} total={totalWords} color="bg-amber-400" textColor="text-amber-400" />
            <ConfBar label="Unknown" count={unknown} total={totalWords} color="bg-red-400" textColor="text-red-400" />
          </div>
          {totalWords > 0 && (
            <>
              <div className="separator mt-3 mb-2" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Average</span>
                <span className="font-mono text-gray-400">{avgConfidence}%</span>
              </div>
            </>
          )}
        </div>

        {/* Discovery timeline */}
        {hasTimeline ? (
          <div className="glass-card rounded-xl p-5">
            <label className="label mb-3">Discovery Timeline</label>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {entries.filter(e => e.type === 'success').map(entry => (
                <div key={entry.id} className="flex gap-2 text-xs py-0.5">
                  <span className="text-gray-700 font-mono flex-shrink-0 w-12">
                    {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="w-1 h-1 rounded-full bg-accent/40 mt-1.5 flex-shrink-0" />
                  <span className="text-gray-400">{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-xl p-5 flex items-center justify-center">
            <p className="text-xs text-gray-700">No discoveries yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: boolean }) {
  return (
    <div className="glass-card rounded-xl p-4 text-center group">
      <p className={`text-2xl font-bold font-mono transition-all group-hover:animate-number-pop ${accent ? 'text-accent text-glow' : 'text-gray-200'}`}>{value}</p>
      <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mt-1">{label}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-14">{label}</span>
      <div className="flex-1 h-1 bg-white/[0.03] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent/60 to-accent/30 rounded-full transition-all duration-700 progress-shimmer animate-progress-fill"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-gray-600 w-7 text-right">{value}%</span>
    </div>
  )
}

function ConfBar({ label, count, total, color, textColor }: { label: string; count: number; total: number; color: string; textColor: string }) {
  const pct = total ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className={textColor}>{label}</span>
        <span className="text-gray-600 font-mono">{count} ({pct}%)</span>
      </div>
      <div className="h-1.5 bg-white/[0.03] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%`, opacity: 0.7 }} />
      </div>
    </div>
  )
}
