import { useEffect, useState } from 'react';
import { api, date, navigate, useResource, useTask, type Dataset, type Job, type Source, type User, type Version } from './api.js';
import { Upload } from './Upload.js';
import { Report } from './Report.js';
import { Empty, Icon, Modal, Notice } from './ui.js';

export function DatasetDetail({ id, user, sources }: { id: string; user: User; sources: Source[] }) {
  const resource = useResource<{ dataset: Dataset; versions: Version[] }>('/api/datasets/' + id);
  const [versionId, setVersionId] = useState<string>(), [uploading, setUploading] = useState(false), [deleting, setDeleting] = useState(false), task = useTask();
  const version = resource.data?.versions.find(version => version.id === versionId) ?? resource.data?.versions[0];
  if (resource.error) return <><a className="back-link" href="#/">← Your collection</a><Notice error>{resource.error}<button onClick={resource.reload}>Retry</button></Notice></>;
  if (!resource.data) return <p role="status">Opening language evidence…</p>;
  const { dataset, versions } = resource.data;
  return <><a className="back-link" href="#/">← Your collection</a><div className="section-heading detail-heading"><div><span className="tag">{dataset.language_kind} · private</span><h1>{dataset.title}</h1><p className="muted">Added {date(dataset.created_at)} · {versions.length} immutable evidence {versions.length === 1 ? 'version' : 'versions'}</p></div>
    <button className="primary" onClick={() => setUploading(true)}><Icon name="add" />Add evidence</button></div>
    {version ? <><section className="version-bar"><label>Evidence version<select aria-label="Evidence version" value={version.id} onChange={event => setVersionId(event.target.value)}>{versions.map(version => <option key={version.id} value={version.id}>Version {version.revision} · {version.row_count} records · {date(version.created_at)}</option>)}</select></label>
      <a className="button" href={'/api/versions/' + version.id + '/download'} download><Icon name="download" />Original file</a></section>
      <VersionWorkspace key={version.id} version={version} sources={sources} /></> : <Empty title="Give this language its first evidence."><p>Add a wordlist with meaning labels for comparison, or preserve a plain-text sample.</p><button className="primary" onClick={() => setUploading(true)}>Upload first version<Icon name="arrow" /></button></Empty>}
    <div className="deletion-row"><p>Dataset deletion removes every version and report. Background cleanup retires the saved files.</p><button className="danger-text" onClick={() => setDeleting(true)}>Delete language</button></div>
    {uploading && <Upload dataset={id} user={user} onClose={() => setUploading(false)} onSaved={saved => { setVersionId(saved.id); setUploading(false); resource.reload(); }} />}
    {deleting && <Modal title="Delete this language?" onClose={() => setDeleting(false)} busy={task.busy}><p>This removes <strong>{dataset.title}</strong>, all its evidence versions and all comparison reports from your account.</p><p>Saved files enter background deletion. Existing downloaded copies remain separate.</p>
      {task.error && <Notice error>{task.error}</Notice>}<div className="actions"><button onClick={() => setDeleting(false)} disabled={task.busy}>Keep language</button><button className="danger" disabled={task.busy} onClick={() => void task.run(async () => { await api('/api/datasets/' + id, 'DELETE'); navigate('/'); })}>{task.busy ? 'Deleting…' : 'Delete language and reports'}</button></div></Modal>}
  </>;
}

function VersionWorkspace({ version, sources }: { version: Version; sources: Source[] }) {
  const jobs = useResource<Job[]>('/api/versions/' + version.id + '/jobs'), [selected, setSelected] = useState<string>(), task = useTask();
  const current = selected ?? jobs.data?.[0]?.id;
  return <><div className="comparison-toolbar"><div><p className="eyebrow">COMPARE WITH LICENSED REFERENCES</p><h2>From patterns to possibilities.</h2></div><button className="primary" disabled={task.busy} onClick={() => void task.run(async () => {
    const job = await api<Job>('/api/versions/' + version.id + '/jobs', 'POST', { key: crypto.randomUUID() }); setSelected(job.id); jobs.reload();
  })}>{task.busy ? 'Queuing…' : 'Run comparison'}<Icon name="arrow" /></button></div>
    <p className="form-help">Uses this version and documented public references. Similarity does not establish ancestry. No model or paid API is needed.</p>
    {task.error && <Notice error>{task.error}</Notice>}{jobs.error && <Notice error>{jobs.error}<button onClick={jobs.reload}>Retry</button></Notice>}
    {jobs.data && jobs.data.length > 1 && <label className="job-selector">Report history<select aria-label="Report history" value={current} onChange={event => setSelected(event.target.value)}>{jobs.data.map(job => <option key={job.id} value={job.id}>{new Date(job.created_at).toLocaleString()} · {job.status}</option>)}</select></label>}
    {current ? <JobView key={current} id={current} sources={sources} /> : <div className="comparison-intro"><div className="intro-symbols" aria-hidden="true">a b c &nbsp; → &nbsp; α β γ</div><h3>Start with what the evidence supports.</h3>
      <p>The report separates word-form similarity, supported symbol correspondences and observed grammar. It suggests the next useful observations and keeps uncertainty visible.</p></div>}
    <details className="version-provenance"><summary>Evidence rights & source</summary><dl><dt>Creator</dt><dd>{version.rights.creator}</dd><dt>Usage rights</dt><dd>{version.rights.license}</dd></dl>
      {version.rights.sourceUrl && <a href={version.rights.sourceUrl} target="_blank" rel="noreferrer">Original evidence source ↗</a>}{version.rights.notes && <p>{version.rights.notes}</p>}</details>
  </>;
}

function JobView({ id, sources }: { id: string; sources: Source[] }) {
  const [job, setJob] = useState<Job>(), [error, setError] = useState(''), [retry, setRetry] = useState(0), task = useTask();
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<Job>('/api/jobs/' + id, 'GET', undefined, controller.signal);
        if (controller.signal.aborted) return; setJob(next); setError('');
        if (['queued', 'running'].includes(next.status)) timer = setTimeout(() => void poll(), 1000);
      } catch (error) { if (!controller.signal.aborted) setError((error as Error).message); }
    };
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [id, retry]);
  if (error) return <Notice error>{error}<button onClick={() => setRetry(retry + 1)}>Retry connection</button></Notice>;
  if (!job) return <p role="status">Loading comparison…</p>;
  if (job.status === 'complete' && job.report) return <Report report={job.report} job={id} sources={sources} />;
  if (job.status === 'failed' || job.status === 'cancelled') return <Notice error={job.status === 'failed'}>{job.status === 'cancelled' ? 'Comparison cancelled. No report was published.' :
    job.error_code === 'input-unavailable' ? 'The saved input failed its availability or integrity check. Inspect the original file and add a fresh version.' :
      job.error_code === 'timeout' ? 'The comparison reached its time limit. Reduce the evidence scope and retry.' :
        job.error_code === 'attempt-limit' ? 'The comparison reached its recovery limit after interruptions. You can start a new comparison.' : 'The comparison could not finish. Check worker status and retry.'}</Notice>;
  return <section className="job-progress" aria-live="polite"><div><span className="eyebrow">{job.status === 'queued' ? 'SAVED IN THE QUEUE' : 'EXAMINING THE EVIDENCE'}</span>
    <h3>{job.status === 'queued' ? 'Your comparison is queued.' : 'Aligning words and testing correspondences…'}</h3><p>{job.status === 'queued' ? 'The worker processes one comparison at a time.' : 'Reference sources and original-file integrity are checked before publication.'} Attempt {job.attempts || 1} of 3.</p>
    <progress aria-label="Comparison progress" /></div><button disabled={task.busy} onClick={() => void task.run(async () => { await api('/api/jobs/' + id + '/cancel', 'POST', {}); setRetry(retry + 1); })}>Cancel comparison</button>
    {task.error && <Notice error>{task.error}</Notice>}</section>;
}
