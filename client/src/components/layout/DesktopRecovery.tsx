import { useEffect, useState } from 'react'

interface State { phase: 'starting' | 'running' | 'unavailable'; message: string; strictOffline?: boolean }
interface Bridge {
  backendStatus(): Promise<State>
  onBackendState(callback: (state: State) => void): () => void
  restartBackend(): Promise<void>
  checkUpdates(): Promise<{ version: string | null; currentVersion: string }>
}
export function DesktopRecovery() {
  const bridge = (window as unknown as { xeno?: Bridge }).xeno
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!bridge?.backendStatus) return
    let active = true
    void bridge.backendStatus().then(value => { if (active) setState(value) }).catch(() => {})
    const remove = bridge.onBackendState(value => setState(previous => ({ ...previous, ...value })))
    return () => { active = false; remove() }
  }, [bridge])
  if (!state) return null
  const restart = async () => {
    setBusy(true); setError('')
    try { await bridge!.restartBackend() } catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  const updates = async () => {
    setBusy(true)
    try { const value = await bridge!.checkUpdates(); setError(`Installed ${value.currentVersion}; available ${value.version ?? 'unknown'}. No update was downloaded.`) }
    catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  return <aside aria-label="Desktop connection" style={{ position: 'fixed', bottom: 38, left: 16, zIndex: 65, maxWidth: 'min(500px,90vw)' }}>
    {state.phase !== 'running' && <div className="glass-card" style={{ padding: 16 }}>
      <p role="alert">{state.message}</p>
      <button className="btn" disabled={busy || state.phase === 'starting'} onClick={() => void restart()}>Restart local backend</button>
      <p>Recovery waits for local drafts, then reopens the project selector.</p>
    </div>}
    {state.phase === 'running' && <details className="glass-card" style={{ padding: 8 }}><summary>Desktop · {state.strictOffline ? 'strict offline' : 'manual updates'}</summary>
      <p>Updates never download automatically.</p>
      <button className="btn sm" disabled={busy || state.strictOffline} onClick={() => void updates()}>Check for updates</button>
      {state.strictOffline && <p>Update checks, model downloads and browser/OS voice fallback are disabled. Restart without --strict-offline to enable them.</p>}
    </details>}
    {error && <p role="status" className="glass-card" style={{ padding: 12 }}>{error}</p>}
  </aside>
}
