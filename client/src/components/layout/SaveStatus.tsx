import { useProfile } from '@/stores/profile-context'

export function SaveStatus() {
  const { profile, saveStatus, pendingSaves, retrySave, resolveSave } = useProfile()
  const items = pendingSaves.length ? pendingSaves : profile ? [{ id: profile.id, name: profile.name, ...saveStatus }] : []
  return <div aria-live="polite" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
    {items.map(item => <span key={item.id} title={item.message} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {items.length > 1 || item.id !== profile?.id ? `${item.name}: ` : ''}
      <span style={{ color: item.phase === 'failed' || item.phase === 'conflict' ? 'var(--conf-unknown)' : 'var(--fg-dim)' }}>
        {item.phase === 'failed' ? 'Save failed' : item.phase === 'conflict' ? 'Save conflict' : !item.durable ? 'Saving draft…' : item.phase === 'saving' ? 'Saving…' : item.phase === 'pending' ? 'Pending on device' : 'Saved'}
      </span>
      {item.phase === 'failed' && <button className="btn xs ghost" aria-label={`Retry save for ${item.name}`} onClick={() => { void retrySave(item.id) }}>Retry</button>}
      {item.phase === 'conflict' && <>
        <button className="btn xs ghost" onClick={() => { void resolveSave(item.id, true).catch(() => {}) }}>Keep my changes</button>
        <button className="btn xs ghost" title="Discard pending profile edits and use the current saved version" onClick={() => { void resolveSave(item.id, false).catch(() => {}) }}>Use saved version</button>
      </>}
    </span>)}
  </div>
}
