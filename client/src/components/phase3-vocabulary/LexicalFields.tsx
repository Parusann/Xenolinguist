import type { DictionaryEntry } from 'shared/types'

type Fields = Pick<DictionaryEntry, 'senses' | 'form_aliases' | 'verb_frame' | 'english_plural'>
export function LexicalFields({ value, onChange }: { value: Fields; onChange: (value: Fields) => void }) {
  const senses = value.senses ?? []
  return <fieldset className="glass-inner" style={{ padding: 12, display: 'grid', gap: 10 }}>
    <legend>Accepted forms and senses</legend>
    <p className="dim" style={{ fontSize: 12 }}>Optional. Each sense is one meaning; aliases accept alternative English phrases. A slash in the display gloss does not create senses.</p>
    <label className="label">Alien form aliases (one per line)
      <textarea className="input" aria-label="Alien form aliases" value={(value.form_aliases ?? []).join('\n')} onChange={e => onChange({ ...value, form_aliases: e.target.value.split('\n') })} />
    </label>
    <label className="label">Verb argument frame (for symbolic clauses)
      <select className="input" aria-label="Verb argument frame" value={value.verb_frame ?? ''} onChange={e => onChange({ ...value, verb_frame: e.target.value ? e.target.value as 'transitive' | 'intransitive' : null })}>
        <option value="">Unspecified / not a verb</option><option value="intransitive">Subject only</option><option value="transitive">Subject and object</option>
      </select>
    </label>
    <label className="label">English plural override (optional noun form)
      <input className="input" aria-label="English plural override" maxLength={128} value={value.english_plural ?? ''} onChange={e => onChange({ ...value, english_plural: e.target.value || null })} />
    </label>
    {senses.map((sense, i) => <div key={i} style={{ display: 'grid', gap: 6 }}>
      <label className="label">Sense {i + 1}
        <input className="input" aria-label={`Sense ${i + 1} meaning`} maxLength={512} value={sense.meaning} onChange={e => onChange({ ...value, senses: senses.map((s, j) => i === j ? { ...s, meaning: e.target.value } : s) })} />
      </label>
      <label className="label">Accepted English aliases (one per line)
        <textarea className="input" aria-label={`Sense ${i + 1} aliases`} value={sense.aliases.join('\n')} onChange={e => onChange({ ...value, senses: senses.map((s, j) => i === j ? { ...s, aliases: e.target.value.split('\n') } : s) })} />
      </label>
      <button className="btn xs ghost" onClick={() => onChange({ ...value, senses: senses.filter((_, j) => i !== j) })}>Remove sense {i + 1}</button>
    </div>)}
    <button className="btn sm ghost" disabled={senses.length >= 64} onClick={() => onChange({ ...value, senses: [...senses, { meaning: '', aliases: [] }] })}>Add explicit sense</button>
  </fieldset>
}
