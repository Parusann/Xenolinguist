import { useState } from 'react'
import type { ArchivePreview, ArchiveRestore } from 'shared/schemas/archive'
import type { LanguageProfile } from 'shared/types'

export function ImportPreview({ preview, target, ready, busy, onRestore, onCancel }: {
  preview: ArchivePreview; target: LanguageProfile | null; ready: boolean; busy: boolean
  onRestore: (options: ArchiveRestore) => void; onCancel: () => void
}) {
  const [replace, setReplace] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  return <section aria-label="Archive preview" className="glass-card" style={{ padding: 18, marginTop: 12 }}>
    <h3>Restore {preview.name}</h3>
    <p>Verified revision {preview.sourceRevision} · {(preview.expandedBytes / 1048576).toFixed(1)} MiB</p>
    <p>{preview.counts.words} words · {preview.counts.rules} grammar rules · {preview.counts.samples} samples · {preview.counts.recordings} recordings · {preview.counts.proposals} AI history records · {preview.counts.snapshots} metric snapshots</p>
    <p>Sandbox state: {preview.sandboxIncluded ? 'included when present' : 'excluded'}. All referenced recording files passed verification.</p>
    <ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
    <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
      <legend>Restore destination</legend>
      <label style={{ display: 'block' }}><input type="radio" name="archive-destination" checked={!replace} onChange={() => { setReplace(false); setConfirmed(false) }} /> Create a new project (recommended)</label>
      {target && <label style={{ display: 'block' }}><input type="radio" name="archive-destination" checked={replace} onChange={() => setReplace(true)} /> Replace {target.name}</label>}
      {replace && target && <div>
        <p>This replaces {target.dictionary.length} words, {target.grammar_rules.length} rules, {target.samples.length} samples and {target.audio_clips.length} recordings in revision {target.revision}. A complete backup, including sandbox state, must succeed first.</p>
        <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I want to replace this project with the archive</label>
        {!ready && <p role="status">Finish or resolve pending saves before replacing this project.</p>}
      </div>}
      <p className="dim">Preview expires at {new Date(preview.expiresAt).toLocaleTimeString()}. New identities preserve relationships and avoid collisions.</p>
      <div className="flex" style={{ gap: 8 }}>
        <button className="btn primary" disabled={replace && (!confirmed || !ready)} onClick={() => onRestore(replace && target
          ? { mode: 'replace', targetId: target.id, expectedRevision: target.revision } : { mode: 'new' })}>{busy ? 'Restoring…' : 'Restore project'}</button>
        <button className="btn" onClick={onCancel}>Cancel preview</button>
      </div>
    </fieldset>
  </section>
}
