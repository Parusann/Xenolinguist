import { useRef, useState } from 'react';
import { ATLAS_LIMITS, type VersionMetadata } from '../../../shared/schemas/atlas.js';
import { importEvidence, type ImportedRecord } from '../../../shared/language-evidence.js';
import { api, useTask, type User, type Version } from './api.js';
import { Icon, Modal, Notice } from './ui.js';

const choices = {
  word_order: { label: 'Constituent order', values: ['SOV', 'SVO', 'VSO', 'VOS', 'OVS', 'OSV', 'No dominant order'] },
  adposition_order: { label: 'Adposition order', values: ['Postpositions', 'Prepositions', 'Inpositions', 'No dominant order', 'No adpositions'] },
  morphology: { label: 'Inflectional affixing preference', values: ['Little affixation', 'Strongly suffixing', 'Weakly suffixing', 'Equal prefixing and suffixing', 'Weakly prefixing', 'Strong prefixing'] },
};
export function Upload({ dataset, user, onClose, onSaved }: { dataset: string; user: User; onClose: () => void; onSaved: (version: Version) => void }) {
  const [format, setFormat] = useState<'csv' | 'json' | 'text'>('csv'), [content, setContent] = useState(''), [preview, setPreview] = useState<ImportedRecord[] | null>(null);
  const [fileError, setFileError] = useState(''), [features, setFeatures] = useState<VersionMetadata['features']>({});
  const form = useRef<HTMLFormElement>(null), retry = useRef<{ payload: string; key: string } | null>(null), task = useTask();
  const metadata = (): VersionMetadata => {
    const data = new FormData(form.current!);
    return { rights: { license: String(data.get('license')), creator: String(data.get('creator')),
      ...(data.get('sourceUrl') ? { sourceUrl: String(data.get('sourceUrl')) } : {}), ...(data.get('notes') ? { notes: String(data.get('notes')) } : {}) }, features };
  };
  const edit = () => setPreview(null);
  return <Modal title="Add an evidence version" onClose={onClose} busy={task.busy}><form ref={form} onSubmit={event => { event.preventDefault(); void task.run(async () => {
    if (!preview) {
      try { setPreview(importEvidence(format, content, { maxBytes: ATLAS_LIMITS.bytes, maxRows: ATLAS_LIMITS.rows })); }
      catch { throw new Error('Check the file format, required columns, unique IDs, well-formed text and 5,000-row limit.'); }
      return;
    }
    const payload = { format, content, metadata: metadata() }, identity = JSON.stringify(payload);
    if (retry.current?.payload !== identity) retry.current = { payload: identity, key: crypto.randomUUID() };
    const saved = await api<Version>('/api/datasets/' + dataset + '/versions', 'POST', { ...payload, key: retry.current!.key }); onSaved(saved);
  }); }}>
    <p className="muted">Wordlists can include meanings and declared transcriptions. Plain text preserves one sample per nonblank line.</p>
    <div className={preview ? 'hidden' : ''}>
      <label>Choose a file <span className="optional">up to 5 MiB</span><input type="file" accept=".csv,.json,.txt,text/csv,application/json,text/plain" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        void task.run(async () => {
          if (file.size > ATLAS_LIMITS.bytes) throw new Error('Choose a file no larger than 5 MiB.');
          setFileError('');
          const bytes = await file.arrayBuffer(); let value: string;
          try { value = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('The file must contain valid UTF-8 text.'); }
          setContent(value); setFormat(file.name.endsWith('.json') ? 'json' : file.name.endsWith('.txt') ? 'text' : 'csv'); edit();
        });
      }} /></label>
      <label>Format<select aria-label="Format" value={format} onChange={event => { setFormat(event.target.value as typeof format); edit(); }}><option value="csv">CSV wordlist</option><option value="json">JSON wordlist</option><option value="text">Plain text samples</option></select></label>
      <label>Evidence content<textarea value={content} onChange={event => { setContent(event.target.value); edit(); }} rows={7} required maxLength={ATLAS_LIMITS.bytes} spellCheck={false} placeholder={'id,form,meaning,transcription\na,kala,water,k a l a'} /></label>
      <p className="form-help">CSV headers: id, form, optional meaning, transcription and annotations. JSON uses an array of the same fields. Space-separated transcriptions are interpreted as declared segments.</p>
      <div className="form-grid"><label>Creator or source contributors<input name="creator" defaultValue={user.name} required maxLength={256} /></label><label>License or usage rights<input name="license" placeholder="e.g. CC BY 4.0, or owned by me" required maxLength={120} /></label></div>
      <label>Source URL <span className="optional">optional</span><input name="sourceUrl" type="url" pattern="https?://.*" maxLength={2048} /></label>
      <label>Rights or collection notes <span className="optional">optional</span><textarea name="notes" rows={2} maxLength={2048} /></label>
      <details className="feature-editor"><summary>Add grammatical observations <span className="optional">optional</span></summary><p className="form-help">Only observed values enter grammar comparisons. Attach the example or source that supports each observation.</p>
        {Object.entries(choices).map(([key, choice]) => { const featureKey = key as keyof typeof choices, feature = features[featureKey];
          return <fieldset key={key}><legend>{choice.label}</legend><select aria-label={choice.label} value={feature?.value ?? ''} onChange={event => {
            setFeatures(previous => { const next = { ...previous }; if (!event.target.value) delete next[featureKey]; else next[featureKey] = { value: event.target.value, status: 'observed', source: previous[featureKey]?.source ?? '' }; return next; });
          }}><option value="">Not supplied</option>{choice.values.map(value => <option key={value}>{value}</option>)}</select>
          {feature && <><label>Supporting example or source<input required maxLength={2048} value={feature.source} onChange={event => setFeatures({ ...features, [key]: { ...feature, source: event.target.value } })} /></label>
            <label>Evidence status<select value={feature.status} onChange={event => setFeatures({ ...features, [key]: { ...feature, status: event.target.value as 'observed' | 'hypothesis' } })}><option value="observed">Observed in evidence</option><option value="hypothesis">Unverified hypothesis</option></select></label></>}
          </fieldset>;
        })}</details>
    </div>
    {preview && <section className="upload-review"><p className="eyebrow">REVIEW BEFORE TRANSFER</p><h3>{preview.length} evidence records</h3>
      <p>{preview.filter(row => row.meaning).length} have meaning labels. {preview.filter(row => row.transcription).length} have declared transcriptions.</p>
      <div className="table-scroll"><table><thead><tr><th>Form</th><th>Meaning</th><th>Transcription</th></tr></thead><tbody>{preview.slice(0, 5).map(row => <tr key={row.id}><td>{row.form}</td><td>{row.meaning ?? 'Not supplied'}</td><td>{row.transcription ?? 'Not supplied'}</td></tr>)}</tbody></table></div>
      <p className="form-help">Preview shows the first five records. Original bytes will be retained with a checksum and a new immutable version.</p><button type="button" onClick={edit} disabled={task.busy}>Edit evidence</button>
    </section>}
    <Notice>Only this evidence file and the source notes shown above will be transferred to your private account. No public sharing or model training permission is granted.</Notice>
    {(task.error || fileError) && <Notice error>{task.error || fileError}</Notice>}
    <div className="actions"><button type="button" onClick={onClose} disabled={task.busy}>Cancel</button><button className="primary" disabled={task.busy || !content.trim()}>{task.busy ? 'Please wait…' : preview ? 'Upload this version' : 'Review upload'}<Icon name="arrow" /></button></div>
  </form></Modal>;
}
