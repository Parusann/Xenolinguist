import { useEffect, useRef, useState } from 'react'
import { useProfile } from '@/stores/profile-context'
import { apiFetch } from '@/services/api'
import { ARCHIVE_LIMITS, type ArchivePreview, type ArchiveRestore } from 'shared/schemas/archive'
import type { LanguageProfile } from 'shared/types'
import { ImportPreview } from './ImportPreview'

async function download(url: string, filename: string) {
  const response = await fetch(`/api${url}`, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Archive download failed') }
  const blob = await response.blob(), link = document.createElement('a'), objectUrl = URL.createObjectURL(blob)
  link.href = objectUrl; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

export function ProjectArchive() {
  const { profile, saveStatus, loadProfile } = useProfile()
  const [includeSandbox, setIncludeSandbox] = useState(false)
  const [preview, setPreview] = useState<ArchivePreview | null>(null)
  const [restored, setRestored] = useState<{ profile: LanguageProfile; backupId?: string } | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const token = useRef<string | null>(null)
  const ready = saveStatus.phase === 'saved' && saveStatus.durable
  useEffect(() => () => { if (token.current) void apiFetch(`/archives/${token.current}`, { method: 'DELETE' }).catch(() => {}) }, [])
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  async function inspect(file: File) {
    if (file.size > ARCHIVE_LIMITS.bytes) throw new Error('Archive must be no larger than 256 MiB')
    if (token.current) await apiFetch(`/archives/${token.current}`, { method: 'DELETE' })
    token.current = null; setPreview(null); setRestored(null)
    const result = await apiFetch<ArchivePreview>('/archives/inspect', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' },
      body: file, signal: AbortSignal.timeout(120000) })
    token.current = result.token; setPreview(result)
  }
  async function restore(options: ArchiveRestore) {
    if (!preview) return
    const result = await apiFetch<{ profile: LanguageProfile; backupId?: string }>(`/archives/${preview.token}/restore`, {
      method: 'POST', body: JSON.stringify(options), signal: AbortSignal.timeout(120000),
    })
    token.current = null; setPreview(null); setRestored(result)
    setMessage(`Restored ${result.profile.name}. Recordings and saved relationships are ready.`)
  }
  return <section aria-label="Portable project archive" className="glass-card" style={{ padding: 20, marginBottom: 16, textAlign: 'left' }}>
    <h2 className="label">Portable project archive</h2>
    <p>Back up saved project data and recordings together in a .xeno file, or restore an archive on this computer.</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
      {profile && <>
        <label style={{ display: 'block', marginBottom: 8 }}><input type="checkbox" checked={includeSandbox} onChange={event => setIncludeSandbox(event.target.checked)} /> Include sandbox answers and progress</label>
        <button className="btn primary sm" disabled={!ready} onClick={() => void run(async () => {
          await download(`/archives/export/${profile.id}?revision=${profile.revision}&sandbox=${includeSandbox}`, `${profile.name.replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 80) || 'project'}.xeno`)
          setMessage('Archive download prepared from the saved project revision.')
        })}>Export .xeno archive</button>
        {!ready && <p role="status">Finish or resolve pending saves before exporting.</p>}
      </>}
      <label style={{ display: 'block', marginTop: 12 }}>Import .xeno archive
        <input aria-label="Import .xeno archive" type="file" accept=".xeno" style={{ display: 'block', marginTop: 6 }} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(() => inspect(file))
        }} />
      </label>
    </fieldset>
    <p className="dim">Maximum 256 MiB. Archives contain readable project data and audio; store them somewhere you trust. Unsaved drafts and running jobs are excluded.</p>
    {busy && <p role="status">Verifying and transferring project files…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {preview && <ImportPreview key={preview.token} preview={preview} target={profile} ready={ready} busy={busy}
      onRestore={options => void run(() => restore(options))} onCancel={() => void run(async () => {
        await apiFetch(`/archives/${preview.token}`, { method: 'DELETE' }); token.current = null; setPreview(null)
      })} />}
    {restored && <div>
      {restored.backupId && <p>Previous project backed up as {restored.backupId}. <button className="btn sm" disabled={busy} onClick={() => void run(() => download(`/archives/backups/${restored.backupId}`, restored.backupId!))}>Download previous project backup</button></p>}
      <button className="btn primary" disabled={busy} onClick={() => void run(() => loadProfile(restored.profile.id))}>Open restored project</button>
    </div>}
  </section>
}
