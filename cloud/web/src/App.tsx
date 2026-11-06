import { useEffect, useState } from 'react';
import type { ReferenceLanguage } from '../../../shared/schemas/atlas-comparison.js';
import { api, ApiError, date, navigate, useResource, useTask, type Dataset, type Source, type Status, type User, type Version } from './api.js';
import { Auth } from './Auth.js';
import { DatasetDetail } from './Dataset.js';
import { Brand, Empty, Icon, Modal, Notice } from './ui.js';

export function App() {
  const [user, setUser] = useState<User | null>(null), [ready, setReady] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    api<{ user: User }>('/api/me', 'GET', undefined, controller.signal).then(result => setUser(result.user)).catch(error => {
      if (!controller.signal.aborted && (!(error instanceof ApiError) || error.status !== 401)) setError(error.message);
    }).finally(() => { if (!controller.signal.aborted) setReady(true); });
    return () => controller.abort();
  }, [retry]);
  if (!ready || error) return <main className="boot"><Brand /><h1>{error ? 'Atlas is unavailable' : 'Opening your atlas…'}</h1>
    {error && <><Notice error>{error}</Notice><button onClick={() => { setReady(false); setRetry(retry + 1); }}>Try again</button></>}</main>;
  return user ? <Workspace user={user} onSignedOut={() => setUser(null)} /> : <Auth onSignedIn={setUser} />;
}

function Workspace({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const [route, setRoute] = useState(location.hash.slice(1) || '/');
  const status = useResource<Status>('/api/status'), sources = useResource<Source[]>('/api/references'), task = useTask();
  useEffect(() => { const changed = () => setRoute(location.hash.slice(1) || '/'); window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) status.reload(); }, 15000); return () => clearInterval(timer); }, [status.reload]);
  const selected = route.startsWith('/datasets/') ? route.split('/')[2] : null;
  const signOut = () => void task.run(async () => { await api('/api/auth/sign-out', 'POST', {}); onSignedOut(); });
  return <div className="workspace"><aside className="sidebar"><Brand /><p className="nav-caption">RESEARCH SPACE</p><nav aria-label="Main navigation">
    <a href="#/" aria-current={route === '/' || selected ? 'page' : undefined}><Icon name="collection" />Your collection</a>
    <a href="#/references" aria-current={route === '/references' ? 'page' : undefined}><Icon name="globe" />Reference atlas</a>
    <a href="#/system" aria-current={route === '/system' ? 'page' : undefined}><Icon name="system" />System & recovery</a>
  </nav><div className="sidebar-bottom"><div className="privacy-card"><span className="mini-label">PRIVATE PERSONAL BETA</span><p>Your uploads stay private.<br />Model training is off.</p></div>
    <div className="account"><span className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
    <button className="text-button" disabled={task.busy} onClick={signOut}>Sign out</button>
    {task.error && <Notice error>{task.error}</Notice>}
  </div></aside><div className="workspace-body"><header className="topbar"><span>THE XENOLINGUIST PROJECT <span className="topbar-slash">/</span> ATLAS</span>
    <span className="connection"><span className={'status-dot' + (status.error ? ' offline' : '')} />{status.error ? 'Connection unavailable' : 'Local server connected'}</span><button className="text-button mobile-signout" disabled={task.busy} onClick={signOut}>Sign out</button></header>
    <main className="page" id="main-content">{status.error && <Notice error>{status.error} <button className="text-button" onClick={status.reload}>Reconnect</button>
      <button className="text-button" onClick={onSignedOut}>Return to sign in</button></Notice>}
      {selected ? <DatasetDetail key={selected} id={selected} user={user} sources={sources.data ?? []} /> : route === '/references' ? <References /> :
        route === '/system' ? <System status={status.data} /> : <Collection user={user} sources={sources.data ?? []} />}
    </main><footer className="page-footer"><span>Xenolinguist Atlas · Evidence before conclusions</span><span>Personal beta 0.1</span></footer>
  </div></div>;
}

function Collection({ user, sources }: { user: User; sources: Source[] }) {
  const datasets = useResource<Dataset[]>('/api/datasets'), [creating, setCreating] = useState(false), example = useTask();
  const vocabulary = sources.find(source => source.forms > 0);
  const loadExample = () => void example.run(async () => {
    const references = await api<ReferenceLanguage[]>('/api/reference-languages'), english = references.find(reference => reference.id === 'English');
    if (!english) throw new Error('The English reference exercise is unavailable.');
    const dataset = await api<Dataset>('/api/datasets', 'POST', { title: 'English reference exercise', languageKind: 'known', glottocode: 'stan1293' });
    const content = JSON.stringify(english.entries.slice(0, 8).map(entry => ({ id: entry.id, form: entry.form, meaning: entry.meaning,
      ...(entry.transcription ? { transcription: entry.transcription } : {}) })), null, 2);
    const version = await api<Version>('/api/datasets/' + dataset.id + '/versions', 'POST', { key: crypto.randomUUID(), format: 'json', content,
      metadata: { rights: { creator: 'WOLD English vocabulary contributors', license: english.license, sourceUrl: english.sourceUrl,
        notes: 'Known English reference exercise. Full source attribution accompanies the comparison report.' } } });
    await api('/api/versions/' + version.id + '/jobs', 'POST', { key: crypto.randomUUID() }); navigate('/datasets/' + dataset.id);
  });
  return <><section className="collection-hero"><div><p className="eyebrow">THE NEXT DISCOVERY STARTS WITH A SAMPLE</p><h1>Evidence, before<br /><em>conclusions.</em></h1>
    <p className="lede">A home for your language evidence.<br />Compare patterns. Trace sources. Test what comes next.</p>
    <button className="primary" onClick={() => setCreating(true)}><Icon name="add" />Add a language</button></div>
    <div className="field-note"><div className="note-heading"><span>FIELD NOTE / 001</span><span>χ</span></div><p className="note-script" aria-hidden="true">水 · mizu · maji</p><p>Similarity is a starting point.<br /><strong>Evidence is the way forward.</strong></p>
      <div className="note-rule" /><small>FORMS → CORRESPONDENCES → TESTABLE PROPOSALS</small></div></section>
    <div className="stat-strip"><div><strong>{datasets.data?.length ?? '—'}</strong><span>Your languages</span></div><div><strong>{vocabulary?.languages ?? '—'}</strong><span>Reference languages</span></div>
      <div><strong>{vocabulary?.forms ?? '—'}</strong><span>Licensed word forms</span></div><div><strong>Private</strong><span>Default visibility</span></div></div>
    <div className="section-heading"><div><p className="eyebrow">YOUR EVIDENCE LIBRARY</p><h2>Your collection</h2></div><button onClick={() => setCreating(true)}>New language<Icon name="add" /></button></div>
    {datasets.error && <Notice error>{datasets.error}<button className="text-button" onClick={datasets.reload}>Retry</button></Notice>}
    {datasets.loading && !datasets.data && <p role="status">Loading your collection…</p>}
    {datasets.data?.length === 0 ? <Empty title="A blank page, full of possibility."><p>Start with a known language, an unknown sample or a language you created.</p>
      <button className="primary" onClick={() => setCreating(true)}>Create your first language<Icon name="arrow" /></button>
      <button className="text-button" disabled={example.busy} onClick={loadExample}>{example.busy ? 'Preparing exercise…' : 'Explore a licensed English example'}</button></Empty> :
      <div className="dataset-grid">{datasets.data?.map(dataset => <a className="dataset-card" href={'#/datasets/' + dataset.id} key={dataset.id}><span className="tag">{dataset.language_kind}</span>
        <h3>{dataset.title}</h3><p>{dataset.versions} evidence {dataset.versions === 1 ? 'version' : 'versions'}</p><div className="card-foot"><span>Added {date(dataset.created_at)}</span><Icon name="arrow" /></div></a>)}</div>}
    {example.error && <Notice error>{example.error}</Notice>}
    <div className="principles"><article><span>01 / COLLECT</span><h3>Keep the original.</h3><p>Versioned wordlists and samples preserve the bytes you uploaded alongside normalized forms.</p></article>
      <article><span>02 / COMPARE</span><h3>Follow the evidence.</h3><p>Inspect aligned words, supported correspondences and cited grammatical observations.</p></article>
      <article><span>03 / QUESTION</span><h3>Know what is missing.</h3><p>Coverage and counterexamples stay visible. Proposals remain hypotheses to test.</p></article></div>
    {creating && <NewDataset onClose={() => setCreating(false)} user={user} />}</>;
}

function NewDataset({ onClose }: { onClose: () => void; user: User }) {
  const task = useTask();
  return <Modal title="Add a language" onClose={onClose} busy={task.busy}><form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
    void task.run(async () => { const dataset = await api<Dataset>('/api/datasets', 'POST', { title: form.get('title'), languageKind: form.get('kind'),
      ...(form.get('glottocode') ? { glottocode: form.get('glottocode') } : {}) }); onClose(); navigate('/datasets/' + dataset.id); }); }}>
    <p className="muted">Give this collection a name. You can add evidence versions on the next screen.</p>
    <label>Language or collection name<input name="title" required maxLength={120} placeholder="e.g. Field notebook, spring expedition" autoFocus /></label>
    <label>Language type<select name="kind" defaultValue="unknown"><option value="unknown">Unknown language</option><option value="known">Known language</option><option value="conlang">Constructed language</option><option value="synthetic">Synthetic research language</option></select></label>
    <label>Glottocode <span className="optional">optional</span><input name="glottocode" pattern="[a-z]{4}[0-9]{4}" placeholder="e.g. stan1293" /></label>
    <Notice>Private to your account. Publication, cross-user comparison and model training are off.</Notice>{task.error && <Notice error>{task.error}</Notice>}
    <div className="actions"><button type="button" onClick={onClose} disabled={task.busy}>Cancel</button><button className="primary" disabled={task.busy}>{task.busy ? 'Creating…' : 'Create language'}<Icon name="arrow" /></button></div>
  </form></Modal>;
}

function References() {
  const catalog = useResource<ReferenceLanguage[]>('/api/reference-languages'), sources = useResource<Source[]>('/api/references');
  return <><p className="eyebrow">A DOCUMENTED STARTING POINT</p><h1>The reference atlas.</h1><p className="lede narrow">Six contrasting languages, with a clear trail back to their source. The collection grows through documented, validated additions.</p>
    {catalog.error && <Notice error>{catalog.error}</Notice>}<div className="reference-grid">{catalog.data?.map(language => <article className="reference-card" key={language.sourceId + language.id}>
      <span className="tag">{language.license}</span><h2>{language.name}</h2><p>{language.entries.length} word forms · {Object.keys(language.features).length} grammatical observations</p>
      <div className="word-specimens">{language.entries.slice(0, 3).map(entry => <div key={entry.id}><strong>{entry.form}</strong><span>{entry.meaning}</span></div>)}</div>
      <details><summary>Observed structure</summary>{Object.keys(language.features).length ? Object.entries(language.features).map(([key, feature]) => <p key={key}><span className="mini-label">{key.replaceAll('_', ' ')}</span><br />{feature.value}<br /><a href={feature.sourceUrl} target="_blank" rel="noreferrer">WALS source ↗</a></p>) : <p>Selected structural data is missing or the language mapping is ambiguous.</p>}</details>
      <a href={language.sourceUrl} target="_blank" rel="noreferrer">Vocabulary source ↗</a></article>)}</div>
    <section className="source-section"><p className="eyebrow">CREDIT & PROVENANCE</p><h2>Sources stay with the evidence.</h2>{sources.data?.map(source => <details key={source.id}><summary>{source.id} · {source.license}</summary>
      <p><a href={source.url} target="_blank" rel="noreferrer">Open the source release ↗</a></p><pre className="attribution">{source.attribution}</pre><p className="hash">SHA-256 {source.sha256}</p></details>)}</section></>;
}

function System({ status }: { status?: Status }) {
  return <><p className="eyebrow">LOCAL BY DESIGN</p><h1>A small, capable foundation.</h1><p className="lede narrow">Atlas runs on the host computer and its configured hard drive. Availability follows the computer's power and network connection.</p>
    <div className="system-grid"><article className="panel"><h2>Service</h2><dl><dt>Comparison worker</dt><dd>{status?.worker.active ? status.worker.running ? 'Computing a report' : 'Ready' : 'Unavailable'}</dd>
      <dt>Pending object deletions</dt><dd>{status?.deletion.pendingObjects ?? '—'}</dd><dt>Last cleanup</dt><dd>{status?.worker.lastCleanupAt ? new Date(status.worker.lastCleanupAt).toLocaleString() : 'Awaiting the first scan'}</dd>
      <dt>Last worker error</dt><dd>{status?.worker.lastError ?? 'None'}</dd><dt>Required subscriptions</dt><dd>$0 per month</dd></dl><p className="form-help">Electricity and future storage purchases are separate. No paid API calls are required.</p></article>
    <article className="panel"><h2>Recovery</h2><p>{status?.backup?.lastVerifiedAt ? 'Last verified restore: ' + new Date(status.backup.lastVerifiedAt).toLocaleString() : 'No verified restore has been recorded yet.'}</p>
      <Notice>{status?.backup?.independent ? 'An independent backup location is configured.' : 'Current snapshots use the same hard drive. Add an independent copy before storing irreplaceable submissions.'}</Notice>
      {status?.backup?.stale && <p>A new verified recovery snapshot is due.</p>}</article></div>
    <section className="panel limits"><h2>Personal beta scope</h2><p>5 MiB per upload · 5,000 rows · 10 languages · 20 versions per language · 256 MiB per account</p>
      <p>Comparisons use your own uploads and licensed references. Cross-user sharing is a later release. Training permission stays off. Reports describe evidence and conditional hypotheses.</p></section></>;
}
