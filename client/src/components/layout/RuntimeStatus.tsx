import { useEffect, useState } from 'react'
import type { JobRecord, RuntimeCapabilities } from 'shared/schemas/capabilities'
import { useOllama } from '@/stores/ollama-context'
import { apiFetch } from '@/services/api'

type Status = RuntimeCapabilities & { setupModels: { name: string; approximateBytes: number }[] }
export function RuntimeStatus() {
  const { inventory, selectedModel, setSelectedModel, refresh } = useOllama()
  const [open, setOpen] = useState(false), [status, setStatus] = useState<Status | null>(null)
  const [jobs, setJobs] = useState<JobRecord[]>([]), [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      try {
        const [runtime, work] = await Promise.all([apiFetch<Status>('/ollama/capabilities'), apiFetch<{ jobs: JobRecord[] }>('/jobs')])
        if (!cancelled) { setStatus(runtime); setJobs(work.jobs); setError('') }
      } catch { if (!cancelled) { setStatus(null); setError('Runtime status unavailable. Retry after the server reconnects.') } }
    }
    void load(); const timer = setInterval(() => void load(), 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [open])
  const download = async (model: string) => {
    try { await apiFetch('/ollama/pull', { method: 'POST', body: JSON.stringify({ model, confirmed: true }) }); await refresh() }
    catch (failure) { setError((failure as Error).message) }
  }
  const cancel = async (id: string) => { try { await apiFetch('/jobs/' + id, { method: 'DELETE' }) } catch (failure) { setError((failure as Error).message) } }
  return <div style={{ position: 'fixed', right: 16, bottom: 38, zIndex: 60 }}>
    <button className="btn sm" onClick={() => setOpen(!open)}>Runtime & setup</button>
    {open && <section aria-label="Runtime and setup" className="glass-card" style={{ position: 'absolute', bottom: 42, right: 0, width: 'min(570px, 92vw)', maxHeight: '75vh', overflow: 'auto', padding: 20 }}>
      <h2>Local runtime</h2>
      <p>Ollama service: {inventory?.connected ? 'reachable' : 'unavailable'} · Chat: {inventory?.ready ? 'local model verified' : 'not ready'}</p>
      <p className="dim">Storage and audio work independently of chat. Model files being present does not guarantee a successful inference.</p>
      {error && <p role="alert">{error}</p>}
      {status && <><ul>{(['storage', 'tts', 'stt', 'phones', 'chat'] as const).map(key => <li key={key}><b>{key}</b>: {status[key].state} — {status[key].detail}</li>)}</ul>
        <p className="dim">{status.resources.cpuCount} CPU threads · {(status.resources.freeMemoryBytes / 1e9).toFixed(1)} GB memory available · checked {new Date(status.checkedAt).toLocaleTimeString()}</p></>}
      <label>Local chat model<select aria-label="Local chat model" className="input" value={selectedModel} onChange={event => setSelectedModel(event.target.value)}><option value="">Select a verified local model</option>{inventory?.inventory?.filter(model => model.eligible).map(model => <option key={model.name} value={model.name}>{model.name} · {(model.size / 1e9).toFixed(2)} GB</option>)}</select></label>
      {inventory?.inventory?.map(model => <details key={model.name}><summary>{model.name} · {model.location}{model.eligible ? '' : ' · unavailable for chat'}</summary><p>{model.reason}</p><p className="font-mono" style={{ overflowWrap: 'anywhere' }}>Digest: {model.digest || 'unknown'}<br />Capabilities: {model.capabilities.join(', ') || 'unverified'}</p></details>)}
      <h3>Model setup</h3><p>Install and start <a href="https://ollama.com/download" target="_blank" rel="noreferrer">Ollama</a> first. Downloads need internet and additional temporary disk space. Nothing downloads automatically.</p>
      {(status?.setupModels ?? []).map(model => <div key={model.name} style={{ marginBottom: 8 }}><span>{model.name} · approximately {(model.approximateBytes / 1e9).toFixed(1)} GB </span><button className="btn sm" disabled={!inventory?.connected || jobs.some(job => job.lane === 'download' && ['queued', 'running'].includes(job.state))} onClick={() => void download(model.name)}>Download {model.name}</button></div>)}
      <h3>Recent work</h3><p className="dim">One generation and one acoustic analysis at a time. Cancelling waits for execution to stop. Partial download files may remain in Ollama for retry.</p>
      {jobs.slice(-12).reverse().map(job => <div key={job.id} style={{ marginBottom: 10 }}><b>{job.task}</b> · {job.cancelRequested && job.state === 'running' ? 'stopping' : job.state}<div>{job.progress?.status}{job.progress?.total ? ' · ' + Math.round((job.progress.completed ?? 0) / job.progress.total * 100) + '%' : ''}</div>{job.error && <div role="status">{job.error}</div>}{['queued', 'running'].includes(job.state) && <button className="btn xs" onClick={() => void cancel(job.id)}>Cancel {job.task}</button>}</div>)}
    </section>}
  </div>
}
