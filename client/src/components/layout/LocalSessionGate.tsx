import { useEffect, useState, type ReactNode } from 'react'

/** The desktop authenticates in main; standalone development requires explicit pairing. */
export function LocalSessionGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [secret, setSecret] = useState('')
  const [message, setMessage] = useState('Connecting to the local application…')
  const check = async () => {
    try {
      const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000) })
      if (response.ok) setReady(true)
      else setMessage(response.status === 401 ? 'Pair this development browser using the code in the server data folder’s .development-pairing file.' : 'The local application rejected this connection. Restart the app or development server.')
    } catch { setMessage('The local server is unavailable. Start it and retry.') }
  }
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal }).then(response => {
      if (response.ok) setReady(true)
      else setMessage('Local pairing is required. For development, use the code in the server data folder’s .development-pairing file; for desktop, restart the app.')
    }).catch(() => { if (!controller.signal.aborted) setMessage('The local server is unavailable. Start it and retry.') })
    return () => controller.abort()
  }, [])
  const pair = async () => {
    try {
      const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret }) })
      setSecret('')
      if (!response.ok) { setMessage('Pairing failed. Check the current code; desktop connections require restarting the app.'); return }
      await check()
    } catch { setMessage('Pairing failed. Check the local server and retry.') }
  }
  if (ready) return children
  return <main className="glass-card" style={{ maxWidth: 580, margin: '15vh auto', padding: 32 }}>
    <h1 className="h-display">Local connection</h1><p role="status">{message}</p>
    <label className="label">Development pairing code<input className="input" type="password" autoComplete="off" aria-label="Development pairing code" value={secret} onChange={event => setSecret(event.target.value)} /></label>
    <div className="flex" style={{ gap: 8, marginTop: 16 }}><button className="btn primary" disabled={!/^[a-f0-9]{64}$/.test(secret)} onClick={() => void pair()}>Pair browser</button><button className="btn" onClick={() => void check()}>Retry connection</button></div>
  </main>
}
