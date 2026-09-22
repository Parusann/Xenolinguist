import type { ExecutableRule } from 'shared/types'
import { executableRuleSchema } from 'shared/schemas/grammar'

const defaults: Record<ExecutableRule['kind'], ExecutableRule> = {
  'plural-affix': { kind: 'plural-affix', position: 'suffix', affix: '-en' },
  'tense-affix': { kind: 'tense-affix', position: 'prefix', affix: 'pa-', tense: 'past' },
  negation: { kind: 'negation', marker: 'ix', position: 'before' },
  'adjective-order': { kind: 'adjective-order', position: 'after' },
  'clause-order': { kind: 'clause-order', order: 'SOV', arguments: 2 },
}
export function RuleEditor({ value, onChange, label }: { value: ExecutableRule | null; onChange: (rule: ExecutableRule | null) => void; label: string }) {
  const validation = value && executableRuleSchema.safeParse(value)
  return <fieldset style={{ display: 'grid', gap: 10, marginTop: 12 }}>
    <legend>{label} execution</legend>
    <label className="label">Representation
      <select className="input" aria-label={`${label} type`} value={value?.kind ?? ''} onChange={e => onChange(e.target.value ? defaults[e.target.value as ExecutableRule['kind']] : null)}>
        <option value="">Notebook prose only</option>
        <option value="plural-affix">Plural affix</option><option value="tense-affix">Tense affix</option>
        <option value="negation">Negation marker</option><option value="adjective-order">Adjective placement</option><option value="clause-order">Clause order</option>
      </select>
    </label>
    {(value?.kind === 'plural-affix' || value?.kind === 'tense-affix') && <>
      <label className="label">Affix (include any hyphen)<input className="input" aria-label={`${label} affix`} maxLength={32} value={value.affix} onChange={e => onChange({ ...value, affix: e.target.value })} /></label>
      <label className="label">Attachment<select className="input" aria-label={`${label} attachment`} value={value.position} onChange={e => onChange({ ...value, position: e.target.value as 'prefix' | 'suffix' })}><option value="prefix">Prefix</option><option value="suffix">Suffix</option></select></label>
    </>}
    {value?.kind === 'tense-affix' && <label className="label">Tense<select className="input" aria-label={`${label} tense`} value={value.tense} onChange={e => onChange({ ...value, tense: e.target.value as 'past' | 'future' })}><option value="past">Past</option><option value="future">Future</option></select></label>}
    {value?.kind === 'negation' && <label className="label">Marker<input className="input" aria-label={`${label} marker`} maxLength={32} value={value.marker} onChange={e => onChange({ ...value, marker: e.target.value })} /></label>}
    {(value?.kind === 'negation' || value?.kind === 'adjective-order') && <label className="label">Placement<select className="input" aria-label={`${label} placement`} value={value.position} onChange={e => onChange({ ...value, position: e.target.value as 'before' | 'after' })}><option value="before">Before {value.kind === 'negation' ? 'verb' : 'noun'}</option><option value="after">After {value.kind === 'negation' ? 'verb' : 'noun'}</option></select></label>}
    {value?.kind === 'clause-order' && <>
      <label className="label">Order<select className="input" aria-label={`${label} order`} value={value.order} onChange={e => onChange({ ...value, order: e.target.value as 'SVO' | 'SOV' | 'VSO' })}>{['SVO', 'SOV', 'VSO'].map(order => <option key={order}>{order}</option>)}</select></label>
      <label className="label">Arguments<select className="input" aria-label={`${label} arguments`} value={value.arguments} onChange={e => onChange({ ...value, arguments: Number(e.target.value) as 1 | 2 })}><option value={1}>Subject only (O omitted)</option><option value={2}>Subject and object</option></select></label>
    </>}
    {validation && !validation.success && <p role="alert">{validation.error.issues[0].message}</p>}
    <p className="dim" style={{ fontSize: 12 }}>{value ? 'Manually asserted executable rule. Previewing an example does not establish accuracy.' : 'Prose remains a notebook entry and does not execute.'}</p>
  </fieldset>
}
