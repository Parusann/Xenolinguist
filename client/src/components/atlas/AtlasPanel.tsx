import { useRef, useState } from 'react'
import { useProfile } from '@/stores/profile-context'
import { HypothesisComparison } from '@/components/evidence/HypothesisComparison'
import { parseAtlasReport, selectedEvidence, stageAtlasHypothesis, textDigest, type AtlasTransferReport } from 'shared/atlas-transfer'
import type { VersionMetadata } from 'shared/schemas/atlas'
import './AtlasPanel.css'

type Status = { connected: boolean; user: { name: string; email: string } | null; expiresAt: string | null; protection: string }
type Bridge = { status: () => Promise<Status>; connect: (code: string) => Promise<Status>; request: (request: unknown) => Promise<unknown>;
  disconnect: () => Promise<{ revocationPending: boolean }>; open: () => Promise<void> }
type Dataset = { id: string; title: string }
type Job = { id: string; status: string; error_code?: string; report?: unknown }
const bridge = (window as unknown as { xeno?: { atlas?: Bridge } }).xeno?.atlas
const download = (text: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function AtlasPanel() {
  const { profile, editResearch, saveStatus } = useProfile()
  const [status, setStatus] = useState<Status>(), [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [search, setSearch] = useState(''), [selected, setSelected] = useState<string[]>([]), [preview, setPreview] = useState('')
  const [creator, setCreator] = useState(''), [license, setLicense] = useState(''), [datasets, setDatasets] = useState<Dataset[]>([]), [target, setTarget] = useState('')
  const [transfer, setTransfer] = useState<{ version: string; digest: string }>(), [job, setJob] = useState<Job>()
  const [loaded, setLoaded] = useState<{ raw: string; report: AtlasTransferReport; digest: string }>()
  const retry = useRef<{ identity: string; key: string } | null>(null)
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); setMessage(''); try { await action() } catch (error) { setError((error as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, '')) } finally { setBusy(false) } }
  const request = async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    if (!bridge) throw new Error('Use the installed desktop to connect. Browser workbench users can export selected evidence and import a downloaded report.')
    return bridge.request({ path, method, ...(body === undefined ? {} : { body }) }) as Promise<T>
  }
  const readReport = async (raw: string) => setLoaded({ raw, report: parseAtlasReport(raw), digest: await textDigest(raw) })
  if (!profile) return null
  const profileId = profile.id
  const rows = [...profile.dictionary.map(entry => ({ id: 'word:' + entry.id, form: entry.alien_word, meaning: entry.english_meaning, kind: 'word' })),
    ...profile.samples.map(sample => ({ id: 'sample:' + sample.id, form: sample.alien_text, meaning: '', kind: 'sample' }))]
  const visible = rows.filter(row => (row.form + ' ' + row.meaning).toLowerCase().includes(search.toLowerCase())).slice(0, 100)
  const staged = profile.research.hypotheses.filter(hypothesis => hypothesis.content.kind === 'atlas-lexical')
  return <section aria-label="Atlas connection" className="atlas-panel max-w-5xl mx-auto space-y-5"><div className="section-header"><div><h1 className="phase-title">Language Atlas</h1>
    <p className="phase-desc">Select evidence, inspect comparisons and bring sourced hypotheses into your research notebook.</p></div></div>
    <div className="glass-card p-5"><h2 className="label">Connection is opt-in</h2><p className="dim">Opening this project transfers no evidence. Atlas uses a separate private account. Choose entries and review the exact transfer below.</p>
      {bridge ? <><div className="flex gap-3 flex-wrap"><button className="btn sm" disabled={busy} onClick={() => void run(async () => { await bridge.open() })}>Open Atlas account page</button>
        <button className="btn sm" disabled={busy} onClick={() => void run(async () => { const value = await bridge.status(); setStatus(value); if (value.user) setCreator(value.user.name) })}>Read connection status</button></div>
        {status && <p role="status">{status.connected ? 'Connected for ' + status.user?.email : 'No active desktop connection'} · {status.protection}{status.expiresAt ? ' · expires ' + new Date(status.expiresAt).toLocaleString() : ''}</p>}
        <label>One-time Atlas connection code<input aria-label="One-time Atlas connection code" type="password" autoComplete="off" value={code} maxLength={100} onChange={event => setCode(event.target.value)} /></label>
        <p className="dim">Approve a connection in System & recovery in the signed-in Atlas browser. Paste its two-minute code here. The credential stays encrypted in the desktop main process.</p>
        <div className="flex gap-3 flex-wrap"><button className="btn primary sm" disabled={busy || !code.trim()} onClick={() => void run(async () => { const value = await bridge.connect(code); setStatus(value); setCreator(value.user?.name ?? ''); setCode(''); setMessage('Desktop connected. Select evidence below to prepare a transfer.') })}>Connect desktop</button>
          <button className="btn sm" disabled={busy} onClick={() => void run(async () => { const result = await bridge.disconnect(); setStatus(undefined); setDatasets([]); setTarget('');
            setMessage(result.revocationPending ? 'Local credential removed. Revoke this connection on the Atlas account page when the server is available.' : 'Desktop connection revoked and its local credential removed.') })}>Disconnect</button></div>
      </> : <p className="dim">This browser workbench supports selected-file export and report import. The installed desktop adds an operating-system-protected connection.</p>}
    </div>
    <div className="glass-card p-5"><h2 className="label">1 · Select evidence</h2><p className="dim">Transfers include selected forms, word meanings and sample-translation notes. Recordings, project archives, chat, confidence scores and other notebook fields are excluded.</p>
      <label>Find evidence<input aria-label="Find Atlas evidence" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <p className="dim">Showing up to 100 matches from {rows.length} records. {selected.length} selected.</p>
      <div className="flex gap-3 mb-3"><button className="btn sm" onClick={() => { setSelected([...new Set([...selected, ...visible.map(row => row.id)])]); setPreview('') }}>Select visible</button>
        <button className="btn sm" onClick={() => { setSelected([]); setPreview('') }}>Clear selection</button></div>
      <div className="max-h-72 overflow-auto"><table className="w-full text-sm"><thead><tr><th>Select</th><th>Form</th><th>Meaning / type</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}>
        <td><input type="checkbox" aria-label={'Select ' + row.form + ' for Atlas'} checked={selected.includes(row.id)} onChange={event => { setSelected(event.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id)); setPreview('') }} /></td>
        <td className="max-w-xs break-words">{row.form}</td><td>{row.meaning || row.kind}</td></tr>)}</tbody></table></div>
      <button className="btn primary sm mt-4" disabled={busy || !selected.length} onClick={() => void run(async () => { setPreview(selectedEvidence(profile, selected)); setTransfer(undefined); setJob(undefined) })}>Preview selected transfer</button>
    </div>
    {preview && <div className="glass-card p-5"><h2 className="label">2 · Review exact transfer</h2><p className="dim">{new TextEncoder().encode(preview).byteLength.toLocaleString()} bytes. Only the JSON below and the source declaration will be sent to the selected private Atlas collection.</p>
      <label>Selected evidence JSON<textarea aria-label="Selected Atlas evidence JSON" readOnly value={preview} rows={9} /></label>
      <button className="btn sm" onClick={() => download(preview, 'xenolinguist-selected-evidence.json')}>Download selected JSON</button>
      {bridge && <><label>Evidence creator<input aria-label="Atlas evidence creator" value={creator} maxLength={256} onChange={event => setCreator(event.target.value)} /></label>
        <label>Usage rights or license<input aria-label="Atlas evidence rights" value={license} maxLength={120} onChange={event => setLicense(event.target.value)} /></label>
        <div className="flex gap-3 flex-wrap"><button className="btn sm" disabled={busy} onClick={() => void run(async () => setDatasets(await request<Dataset[]>('/api/datasets')))}>Refresh Atlas collections</button>
          <button className="btn sm" disabled={busy} onClick={() => void run(async () => { const dataset = await request<Dataset>('/api/datasets', 'POST', { title: profile.name.slice(0, 120), languageKind: profile.is_sandbox ? 'synthetic' : 'unknown' });
            setDatasets(previous => [dataset, ...previous]); setTarget(dataset.id) })}>Create private Atlas collection</button></div>
        <label>Destination collection<select aria-label="Atlas destination collection" value={target} onChange={event => setTarget(event.target.value)}><option value="">Choose a collection</option>{datasets.map(dataset => <option value={dataset.id} key={dataset.id}>{dataset.title}</option>)}</select></label>
        <p className="dim">Private account access only. Publication, cross-user comparison and training permissions remain off.</p>
        <button className="btn primary sm" disabled={busy || !target || !creator.trim() || !license.trim()} onClick={() => void run(async () => {
          const metadata: VersionMetadata = { rights: { creator, license }, features: {} }, identity = JSON.stringify({ target, preview, metadata });
          if (retry.current?.identity !== identity) retry.current = { identity, key: crypto.randomUUID() };
          const version = await request<{ id: string }>('/api/datasets/' + target + '/versions', 'POST', { key: retry.current!.key, format: 'json', content: preview, metadata });
          setTransfer({ version: version.id, digest: await textDigest(preview) }); setMessage('Evidence version saved. Start a comparison when ready.')
        })}>Upload reviewed evidence</button>
      </>}
    </div>}
    {transfer && <div className="glass-card p-5"><h2 className="label">3 · Request comparison</h2><p className="dim break-all">Transferred file SHA-256: {transfer.digest}</p>
      <div className="flex gap-3 flex-wrap"><button className="btn primary sm" disabled={busy} onClick={() => void run(async () => setJob(await request<Job>('/api/versions/' + transfer.version + '/jobs', 'POST', { key: crypto.randomUUID() })))}>Compare transferred version</button>
        {job && <button className="btn sm" disabled={busy} onClick={() => void run(async () => { const next = await request<Job>('/api/jobs/' + job.id); setJob(next);
          if (next.status === 'complete' && next.report) { const raw = JSON.stringify(next.report); const parsed = parseAtlasReport(raw);
            if (parsed.input.versionId !== transfer.version || parsed.input.objectSha256 !== transfer.digest) throw new Error('This report does not match the selected transfer.'); await readReport(raw) }
        })}>Refresh comparison result</button>}</div>{job && <p role="status">Comparison: {job.status}{job.error_code ? ' · ' + job.error_code : ''}</p>}
    </div>}
    <div className="glass-card p-5"><h2 className="label">4 · Review a report</h2><label>Import an Atlas evidence report<input aria-label="Import Atlas evidence report" type="file" accept=".json,application/json" onChange={event => {
      const file = event.target.files?.[0]; if (!file) return; void run(async () => { if (file.size > 4 * 1024 * 1024) throw new Error('Choose a report no larger than 4 MiB.'); await readReport(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())) })
    }} /></label>
      {loaded && <><p>{loaded.report.matches.length} reference candidates · {loaded.report.state}</p><p className="dim break-all">Report SHA-256: {loaded.digest}<br />Input SHA-256: {loaded.report.input.objectSha256}</p>
        <button className="btn sm" onClick={() => download(loaded.raw, 'xenolinguist-atlas-report.json')}>Save report JSON</button>
        <p className="dim">Imported report claims remain unverified. Staging records a sourced proposal for review in Field Log.</p>
        {loaded.report.matches.every(match => !match.proposals.length) && <p>No missing-form proposal meets this report's requirements. Inspect its coverage and next-observation guidance in Atlas.</p>}
        {loaded.report.matches.filter(match => match.proposals.length).map(match => <div className="mt-4" key={match.sourceId + match.languageId}><h3>{match.languageName} · {match.license}</h3>
          {match.proposals.flatMap(proposal => proposal.forms.map(form => <div className="flex gap-3 flex-wrap items-center mt-3" key={proposal.concept + form}><span>{form} → {proposal.meaning}</span>
            <button className="btn sm" disabled={busy || staged.some(h => h.content.kind === 'atlas-lexical' && h.content.report_sha256 === loaded.digest && h.content.concept === proposal.concept && h.content.form === form)} onClick={() => void run(async () => {
              const next = await stageAtlasHypothesis(profile.research, loaded.raw, match.sourceId, match.languageId, proposal.concept, form)
              editResearch(profileId, current => ({ ...current,
                observations: [...current.observations, ...next.observations.filter(item => !current.observations.some(old => old.id === item.id))],
                hypotheses: [...current.hypotheses, ...next.hypotheses.filter(item => !current.hypotheses.some(old => old.id === item.id))],
                links: [...current.links, ...next.links.filter(item => !current.links.some(old => old.id === item.id))] }))
              setMessage('Sourced hypothesis staged as proposed. Review independent evidence before accepting its linguistic claim.')
            })}>Stage proposed hypothesis</button></div>))}</div>)}
      </>}
    </div>
    {message && <p role="status" className="glass-inner p-4">{message}</p>}{error && <p role="alert" className="glass-inner p-4">{error}</p>}
    {staged.length > 0 && <div className="glass-card p-5"><h2 className="label">Staged Atlas hypotheses</h2>{staged.slice(-10).map(hypothesis => <HypothesisComparison key={hypothesis.id} profile={profile} hypothesis={hypothesis}
      edit={edit => editResearch(profileId, edit)} saved={saveStatus.phase === 'saved'} />)}</div>}
  </section>
}
