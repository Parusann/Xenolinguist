import { useRef } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useSessionLog } from '@/stores/session-log-context'
import { useToast } from '@/stores/toast-context'
import type { LanguageProfile } from 'shared/types'
import { migrateProfile, parseProfile } from 'shared/schemas/profile'
import { workspaceMetrics } from 'shared/metrics/workspace-metrics'

export function Dashboard() {
  const { profile, updateProfile } = useProfile()
  const { addToast } = useToast()
  const { entries } = useSessionLog()
  const importRef = useRef<HTMLInputElement>(null)
  if (!profile) return null
  const metrics = workspaceMetrics(profile)
  const totalWords = profile.dictionary.length
  const snapshots = profile.metric_snapshots ?? []
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
        const imported = migrateProfile(JSON.parse(reader.result as string))
        const updates: Partial<LanguageProfile> = {
          dictionary: imported.dictionary, grammar_rules: imported.grammar_rules,
          samples: imported.samples, number_system: imported.number_system, audio_clips: imported.audio_clips,
        }
        // Validate the complete prospective state, including clip/word references, before touching React state.
        parseProfile({ ...profile, ...updates })
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
    const header = 'Alien Word,English,Part of Speech,User belief (0-100),Context\n'
    const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"` // RFC 4180: double embedded quotes
    const rows = profile.dictionary
      .map((e) => [q(e.alien_word), q(e.english_meaning), q(e.part_of_speech), e.confidence, q(e.context)].join(','))
      .join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${profile.name.replace(/\s+/g, '-').toLowerCase()}-dictionary.csv`
    a.click()
    URL.revokeObjectURL(url)
  }


  const tiles = [
    ['Distinct observations', metrics.observations, 'Nonblank sample texts, deduplicated'],
    ['Asserted entries', metrics.assertedEntries, 'Distinct nonblank word–meaning pairs'],
    ['Grammar notes', metrics.grammarNotes, 'Distinct nonblank rule descriptions'],
    ['Competing forms', metrics.competingForms, 'Forms with multiple asserted meanings; may be ambiguity or polysemy'],
  ] as const
  return <div className="phase-enter" style={{ height: '100%', overflow: 'auto' }}>
    <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
      <div><h1 className="h-display">Field <em>Log</em></h1><p className="dim">Workspace evidence for {profile.name}</p></div>
      <div className="flex" style={{ gap: 8 }}>
        <label className="btn sm">↓ Import<input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" /></label>
        <button className="btn primary sm" onClick={handleExport}>↑ Export JSON</button>
        <button className="btn sm ghost" onClick={handleExportCSV} disabled={!totalWords}>↑ CSV</button>
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
      {tiles.map(([label, count, definition]) => <div className="glass-card" key={label} style={{ padding: 20 }}>
        <div className="label">{label}</div><div className="text-glow" style={{ fontSize: 40 }}>{count}</div><p className="dim" style={{ fontSize: 12 }}>{definition}</p>
      </div>)}
    </div>
    <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
      <h2 className="label">Evaluation status</h2>
      <p>Tested linguistic hypotheses: unavailable · Evaluated language coverage: unavailable</p>
      <p className="dim">These counts describe the current workspace, including pending edits. Repetition, user belief and creative practice do not establish correctness or independent evidence.</p>
      <p>{metrics.ratedEntries} of {totalWords} dictionary records have a user belief rating. Ratings are user assertions on a 0–100 scale.</p>
    </div>
    <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
      <h2 className="label">Workspace milestone</h2>
      <p>Numbers 1–20 mapped: <strong>{metrics.mappings1To20}/20</strong></p>
      <p className="dim">{20 - metrics.mappings1To20} remaining in this range. A filled mapping is an assertion; this milestone does not validate a number system.</p>
      <p>Base: {profile.number_system.base == null ? 'unset' : `${profile.number_system.base} (user-selected)`}</p>
    </div>
    <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
      <h2 className="label">Saved metric history</h2>
      <p className="dim">Snapshots record changed counts at successful saves. No history is inferred before recording began. The latest 1,000 snapshots are retained; timestamps are recording times.</p>
      {snapshots.length === 0 ? <p>No saved metric snapshots yet. History starts with the next successful save.</p> : <div style={{ maxHeight: 300, overflow: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left', fontSize: 13 }}>
          <thead><tr>{['Recorded at', 'Revision', 'Observations', 'Assertions', 'Grammar notes', 'Competing forms', 'Numbers 1–20'].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{snapshots.slice().reverse().map(snapshot => <tr key={snapshot.revision}>
            <td>{new Date(snapshot.recorded_at).toLocaleString()}</td><td>{snapshot.revision}</td>
            <td>{snapshot.counts.observations}</td><td>{snapshot.counts.assertedEntries}</td><td>{snapshot.counts.grammarNotes}</td>
            <td>{snapshot.counts.competingForms}</td><td>{snapshot.counts.mappings1To20}/20</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
    <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
      <h2 className="label">Session activity</h2>
      {entries.length === 0 ? <p className="dim">No activity recorded in this session.</p> : <ul style={{ maxHeight: 200, overflow: 'auto' }}>
        {entries.slice().reverse().map(entry => <li key={entry.id} style={{ marginBottom: 8 }}>
          <time className="dim">{new Date(entry.timestamp).toLocaleString()}</time> · {entry.message}
        </li>)}
      </ul>}
    </div>
    <div className="glass-card" style={{ padding: 20 }}><h2 className="label">Guidance</h2>
      <p>Collect examples in different contexts, record alternative meanings, and look for observations that could disprove a rule. Added notes and higher belief ratings alone do not validate a hypothesis.</p>
    </div>
  </div>
}
