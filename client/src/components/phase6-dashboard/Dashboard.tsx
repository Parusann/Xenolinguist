import { useRef } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useSessionLog } from '@/stores/session-log-context'
import { useToast } from '@/stores/toast-context'
import type { LanguageProfile, LogEntryType } from 'shared/types'
import { getConfidenceCounts, getDecodingProgress, cumulativeTrend } from '@/lib/profileStats'
import { ConfRing } from '@/components/common/ConfRing'
import { MiniSpark } from '@/components/common/MiniSpark'

const MILESTONE_TYPES: LogEntryType[] = ['success', 'ai']

export function Dashboard() {
  const { profile, updateProfile } = useProfile()
  const { entries } = useSessionLog()
  const { addToast } = useToast()
  const importRef = useRef<HTMLInputElement>(null)

  if (!profile) return null

  const counts = getConfidenceCounts(profile)
  const decode = getDecodingProgress(profile)
  const totalWords = counts.total
  const avgConfidence =
    totalWords > 0 ? Math.round(profile.dictionary.reduce((sum, e) => sum + e.confidence, 0) / totalWords) : 0
  const grammarRules = profile.grammar_rules.length
  const totalSamples = profile.samples.length
  const decodedSamples = profile.samples.filter((s) => s.decoded).length
  const numbersMapped = Object.keys(profile.number_system.mappings).length
  const base = profile.number_system.base

  // Component progress (same weights as getDecodingProgress)
  const vocabPct = Math.round(Math.min(totalWords / 50, 1) * 100)
  const grammarPct = Math.round(Math.min(grammarRules / 5, 1) * 100)
  const numbersPct = Math.round(Math.min(numbersMapped / 10, 1) * 100)
  const samplesPct = Math.round(Math.min(totalSamples / 10, 1) * 100)

  // Real growth trends from created_at timestamps (not fabricated)
  const vocabHist = cumulativeTrend(profile.dictionary.map((e) => e.created_at))
  const sampleHist = cumulativeTrend(profile.samples.map((s) => s.created_at))
  const lastVocab = vocabHist[vocabHist.length - 1] || 0
  const decodeHist = lastVocab > 0 ? vocabHist.map((v) => Math.round((v / lastVocab) * decode)) : [0, decode]

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
        const updates: Partial<LanguageProfile> = {}
        if (imported.dictionary?.length) updates.dictionary = imported.dictionary
        if (imported.grammar_rules?.length) updates.grammar_rules = imported.grammar_rules
        if (imported.samples?.length) updates.samples = imported.samples
        if (imported.number_system) updates.number_system = imported.number_system
        if (imported.audio_clips) updates.audio_clips = imported.audio_clips
        updateProfile(updates)
        addToast('Profile imported', 'success')
      } catch {
        addToast('Invalid profile JSON file', 'error')
      }
    }
    reader.readAsText(file)
    if (importRef.current) importRef.current.value = ''
  }

  const handleExportCSV = () => {
    const header = 'Alien Word,English,Part of Speech,Confidence,Context\n'
    const rows = profile.dictionary
      .map((e) => `"${e.alien_word}","${e.english_meaning}","${e.part_of_speech}",${e.confidence},"${e.context}"`)
      .join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${profile.name.replace(/\s+/g, '-').toLowerCase()}-dictionary.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fmtTime = (ts: string | number | Date) =>
    new Date(ts).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

  const milestones = [
    { goal: '50% decoding', at: decode, target: 50, hint: decode >= 50 ? 'Reached — push toward 75%' : 'Lock in probable words to climb' },
    { goal: 'All numbers 1–20 mapped', at: numbersMapped, target: 20, hint: numbersMapped >= 20 ? 'Complete' : `${Math.max(0, 20 - numbersMapped)} left to map` },
    { goal: '10 grammar rules', at: grammarRules, target: 10, hint: grammarRules >= 10 ? 'Complete' : `${Math.max(0, 10 - grammarRules)} more rules to document` },
  ]

  const fieldNote = [
    counts.probable > 0
      ? `${counts.probable} probable word${counts.probable === 1 ? '' : 's'} ${counts.probable === 1 ? 'is' : 'are'} close to promotion — re-elicit in fresh contexts to confirm.`
      : null,
    numbersMapped < 20
      ? `${20 - numbersMapped} numbers remain unmapped${base ? ` (base ${base})` : ''}; extending the count strengthens the system.`
      : `Number system looks complete${base ? ` (base ${base})` : ''}.`,
    grammarRules < 5 ? 'Documenting more grammar rules will raise structural confidence.' : 'Grammar coverage is solid — deepen the vocabulary next.',
  ]
    .filter(Boolean)
    .join(' ')

  const trends = [
    { label: 'Decoding %', val: `${decode}%`, data: decodeHist, color: 'var(--accent)' },
    { label: 'Vocabulary', val: totalWords, data: vocabHist, color: 'var(--accent)' },
    { label: 'Samples', val: totalSamples, data: sampleHist, color: 'var(--ai)' },
  ]

  const statTiles = [
    { label: 'Words', val: totalWords, sub: `${counts.confirmed} confirmed`, glyph: 'Aa' },
    { label: 'Grammar', val: grammarRules, sub: 'rules active', glyph: '⟨⟩' },
    { label: 'Samples', val: totalSamples, sub: `${decodedSamples} decoded`, glyph: '{ }' },
    { label: 'Numbers', val: numbersMapped, sub: base ? `base ${base} confirmed` : 'base unset', glyph: '#' },
  ]

  const subBars = [
    { label: 'Vocab', val: vocabPct, count: `${counts.confirmed}/${totalWords}` },
    { label: 'Grammar', val: grammarPct, count: `${grammarRules} rules` },
    { label: 'Numbers', val: numbersPct, count: base ? `base ${base}` : '—' },
    { label: 'Samples', val: samplesPct, count: `${totalSamples} captured` },
  ]

  return (
    <div className="phase-enter" style={{ height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div className="flex" style={{ alignItems: 'baseline', gap: 12 }}>
            <h1 className="h-display" style={{ margin: 0, fontSize: 30 }}>
              Field <em>Log</em>
            </h1>
            <span className="kicker">PHASE 06 · DASHBOARD</span>
          </div>
          <p className="dim" style={{ marginTop: 6, fontSize: 13 }}>
            Overview of decoding progress for <span className="font-mono" style={{ color: 'var(--fg)' }}>{profile.name}</span>
            <span className="muted"> · started {new Date(profile.created_at).toLocaleDateString()}</span>
          </p>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <label className="btn sm" style={{ cursor: 'pointer' }}>
            ↓ Import
            <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button className="btn primary sm" onClick={handleExport}>↑ Export JSON</button>
          <button className="btn sm ghost" onClick={handleExportCSV} disabled={!totalWords}>↑ CSV</button>
        </div>
      </div>

      {/* Hero row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(440px, 1.4fr) 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div className="glass-card" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
          <span className="label">Decoding Progress</span>
          <div className="flex" style={{ alignItems: 'flex-end', gap: 20, marginTop: 14 }}>
            <ConfRing value={decode} size={140} stroke={6} />
            <div style={{ flex: 1, paddingBottom: 12 }}>
              <div className="text-glow" style={{ fontFamily: 'var(--font-display)', fontSize: 84, fontWeight: 200, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--accent)' }}>
                {decode}
                <span style={{ fontSize: 32, color: 'var(--fg-mute)' }}>%</span>
              </div>
              <div className="dim" style={{ marginTop: 6, fontSize: 12.5 }}>
                {counts.confirmed} confirmed · {counts.probable} probable · avg confidence{' '}
                <span className="font-mono" style={{ color: 'var(--fg)' }}>{avgConfidence}%</span>
              </div>
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 16 }}>
                {subBars.map((d) => (
                  <div key={d.label} style={{ flex: 1 }}>
                    <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-mute)' }}>{d.label.toUpperCase()}</span>
                      <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-1)' }}>{d.val}%</span>
                    </div>
                    <div className="cbar confirmed"><span style={{ width: d.val + '%' }} /></div>
                    <div className="font-mono" style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 3 }}>{d.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Confidence distribution */}
        <div className="glass-card" style={{ padding: 20 }}>
          <span className="label">Confidence Distribution</span>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {([
              { label: 'Confirmed', val: counts.confirmed, c: 'confirmed' },
              { label: 'Probable', val: counts.probable, c: 'probable' },
              { label: 'Unknown', val: counts.unknown, c: 'unknown' },
            ] as const).map((d) => {
              const pct = totalWords ? Math.round((d.val / totalWords) * 100) : 0
              return (
                <div key={d.label}>
                  <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className={'c-' + d.c} style={{ fontSize: 13, fontWeight: 500 }}>{d.label}</span>
                    <span className="font-mono" style={{ fontSize: 11, color: 'var(--fg-1)' }}>
                      {d.val} <span className="dim">({pct}%)</span>
                    </span>
                  </div>
                  <div className={'cbar ' + d.c} style={{ height: 6 }}><span style={{ width: pct + '%' }} /></div>
                </div>
              )
            })}
          </div>
          <div className="hr" style={{ margin: '16px 0' }} />
          <div style={{ fontSize: 11.5, color: 'var(--fg-dim)', lineHeight: 1.5 }}>
            {counts.probable > 0 ? (
              <>
                <span className="font-mono c-probable">{counts.probable} probable</span> word{counts.probable === 1 ? '' : 's'} near promotion — fresh contexts could confirm several this week.
              </>
            ) : (
              'No probable words pending — add samples and elicit new vocabulary to grow the dictionary.'
            )}
          </div>
        </div>

        {/* Trends */}
        <div className="glass-card" style={{ padding: 20 }}>
          <span className="label">Trends</span>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {trends.map((d) => (
              <div key={d.label} className="flex" style={{ justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div className="font-mono" style={{ fontSize: 10, color: 'var(--fg-mute)' }}>{d.label.toUpperCase()}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, color: 'var(--fg)' }}>{d.val}</div>
                </div>
                <MiniSpark values={d.data} color={d.color} w={120} h={28} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        {statTiles.map((t) => (
          <div key={t.label} className="glass-card" style={{ padding: 18 }}>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="label" style={{ marginBottom: 0 }}>{t.label}</span>
              <span className="font-mono" style={{ fontSize: 16, color: 'var(--accent)' }}>{t.glyph}</span>
            </div>
            <div className="text-glow" style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 300, color: 'var(--accent)', lineHeight: 1, letterSpacing: '-0.03em' }}>{t.val}</div>
            <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>{t.sub}</div>
          </div>
        ))}
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <div className="glass-card" style={{ padding: 20 }}>
          <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <span className="label" style={{ marginBottom: 0 }}>Discovery Timeline</span>
            <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-mute)' }}>{entries.length} events</span>
          </div>
          {entries.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--fg-faint)' }}>No activity yet — capture samples and map words to build the log.</p>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 16, maxHeight: 320, overflowY: 'auto' }}>
              <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 1, background: 'linear-gradient(to bottom, transparent, var(--border-mid) 8%, var(--border-mid) 92%, transparent)' }} />
              {entries.slice().reverse().map((e) => {
                const isMilestone = MILESTONE_TYPES.includes(e.type)
                return (
                  <div key={e.id} style={{ position: 'relative', paddingBottom: 14 }}>
                    <span style={{ position: 'absolute', left: -16, top: 6, width: 11, height: 11, borderRadius: 6, background: isMilestone ? 'var(--accent)' : 'var(--bg-base)', border: '1.5px solid ' + (isMilestone ? 'var(--accent)' : 'var(--border-strong)'), boxShadow: isMilestone ? '0 0 8px var(--accent)' : 'none' }} />
                    <div className="flex" style={{ alignItems: 'baseline', gap: 12 }}>
                      <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', minWidth: 84 }}>{fmtTime(e.timestamp)}</span>
                      <span className="badge" style={{ fontSize: 9 }}>{e.type}</span>
                      <span style={{ fontSize: 13, color: isMilestone ? 'var(--accent)' : 'var(--fg-1)', fontWeight: isMilestone ? 500 : 400 }}>{e.message}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="glass-card" style={{ padding: 20 }}>
            <span className="label">Next Milestones</span>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {milestones.map((m) => {
                const pct = Math.min(Math.round((m.at / m.target) * 100), 100)
                return (
                  <div key={m.goal} className="glass-inner" style={{ padding: 12 }}>
                    <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--fg)' }}>{m.goal}</span>
                      <span className="font-mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{Math.min(m.at, m.target)}/{m.target}</span>
                    </div>
                    <div className="cbar confirmed"><span style={{ width: pct + '%' }} /></div>
                    <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>{m.hint}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="glass-card" style={{ padding: 20 }}>
            <div className="flex" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}>
              <span className="dot" style={{ background: 'var(--ai)', boxShadow: '0 0 6px var(--ai)' }} />
              <span className="label" style={{ color: 'var(--ai)', marginBottom: 0 }}>AI Field Notes</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.55 }}>{fieldNote}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
