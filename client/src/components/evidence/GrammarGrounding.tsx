import { useState } from 'react'
import type { LanguageProfile } from 'shared/types'
import type { GrammarSetup } from 'shared/schemas/grammar-elicitation'
import type { Lexeme, MeaningTree, Nominal } from 'engine/grammar/ast'
import { englishLemma } from 'engine/morphology/analyze'
import { meaningTreeSchema } from 'engine/morphology/generate'
import { sensesOf } from 'engine/lexicon/senses'
import { meaningVariants } from 'engine/elicitation/queries'
import { stableKey } from 'engine/elicitation/contracts'
import { meaningLabel } from './grammar-grounding'
export function GrammarGrounding({ profile, setup, change, disabled }: { profile: LanguageProfile; setup: GrammarSetup; change: (s: GrammarSetup) => void; disabled: boolean }) {
  const [kind, setKind] = useState<'nominal' | 'clause'>('nominal'), [subject, setSubject] = useState(''), [verb, setVerb] = useState(''), [object, setObject] = useState(''), [error, setError] = useState('')
  const usable = profile.dictionary.filter(e => ['noun', 'pronoun', 'verb'].includes(e.part_of_speech) && englishLemma(sensesOf(e)[0].meaning, e.part_of_speech))
  const nouns = usable.filter(e => e.part_of_speech !== 'verb')
  const addAnchor = () => {
    try {
      const lexeme = (id: string): Lexeme => {
        const e = usable.find(e => e.id === id)
        if (!e) throw Error('Choose each required lexical anchor.')
        const sense = sensesOf(e)[0]
        return { entryId: id, sense: sense.sense, lemma: englishLemma(sense.meaning, e.part_of_speech)!, pos: e.part_of_speech as Lexeme['pos'] }
      }
      const nominal = (id: string): Nominal => ({ head: lexeme(id), plural: false, adjectives: [], ...(usable.find(e => e.id === id)?.english_plural ? { englishPlural: usable.find(e => e.id === id)!.english_plural! } : {}) })
      const meaning: MeaningTree = kind === 'nominal' ? { kind, nominal: nominal(subject) } : { kind, subject: nominal(subject), verb: lexeme(verb), ...(object ? { object: nominal(object) } : {}), tense: 'present', negated: false }
      if (setup.anchors.some(a => stableKey(a) === stableKey(meaning))) throw Error('This anchor is already listed.')
      change({ ...setup, anchors: [...setup.anchors, meaningTreeSchema.parse(meaning)] }); setError('')
    } catch (e) { setError((e as Error).message) }
  }
  const variants = [...new Map(setup.anchors.flatMap(a => meaningVariants([a])).map(a => [stableKey(a), meaningTreeSchema.parse(a)])).values()]
  return <fieldset disabled={disabled} style={{ border: 0, padding: 0 }}>
    <legend>Ground the comparison</legend>
    <p className="dim">Each alternative is a complete rule set. Include shared clause or morphology rules in every alternative that needs them. These saved rules are user assertions.</p>
    {setup.candidates.map((c, i) => <fieldset key={c.id}><legend>Alternative {c.id}</legend>
      {profile.grammar_rules.filter(r => r.executable).map(r => <label key={r.id} style={{ display: 'block' }}><input type="checkbox" aria-label={`Alternative ${c.id}: ${r.rule}`} checked={c.rule_ids.includes(r.id)} onChange={e => change({ ...setup, candidates: setup.candidates.map((v, at) => at !== i ? v : { ...v, rule_ids: e.target.checked ? [...v.rule_ids, r.id] : v.rule_ids.filter(id => id !== r.id) }) })} /> {r.rule}</label>)}
      {c.rule_ids.some(id => !profile.grammar_rules.some(r => r.id === id && r.executable)) && <p role="alert">A selected rule was removed. Remove this alternative or reset the setup.</p>}
      {setup.candidates.length > 2 && <button className="btn xs" onClick={() => change({ ...setup, candidates: setup.candidates.filter(v => v.id !== c.id) })}>Remove alternative {c.id}</button>}
    </fieldset>)}
    <button className="btn sm" disabled={setup.candidates.length >= 32} onClick={() => change({ ...setup, candidates: [...setup.candidates, { id: String.fromCharCode(65 + setup.candidates.length) + '-' + crypto.randomUUID().slice(0, 8), rule_ids: [] }] })}>Add alternative</button>
    <p className="dim">Choose lexical anchors, then explicitly mark the meanings you can observe. No answer is inferred from this permission. This editor uses each entry's first sense and requires correct verb frames.</p>
    <label>Question shape<select className="input" aria-label="Question shape" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="nominal">Noun phrase</option><option value="clause">Clause</option></select></label>
    <label>Question noun or subject<select className="input" aria-label="Question noun or subject" value={subject} onChange={e => setSubject(e.target.value)}><option value="">Choose anchor</option>{nouns.map(e => <option key={e.id} value={e.id}>{e.alien_word} = {sensesOf(e)[0].meaning}</option>)}</select></label>
    {kind === 'clause' && <>
      <label>Question verb<select className="input" aria-label="Question verb" value={verb} onChange={e => setVerb(e.target.value)}><option value="">Choose verb</option>{usable.filter(e => e.part_of_speech === 'verb').map(e => <option key={e.id} value={e.id}>{e.alien_word} = {sensesOf(e)[0].meaning}</option>)}</select></label>
      <label>Question object<select className="input" aria-label="Question object" value={object} onChange={e => setObject(e.target.value)}><option value="">None</option>{nouns.map(e => <option key={e.id} value={e.id}>{e.alien_word} = {sensesOf(e)[0].meaning}</option>)}</select></label>
    </>}
    <button className="btn sm" disabled={setup.anchors.length >= 16} onClick={addAnchor}>Add question anchor</button>
    {error && <p role="alert">{error}</p>}
    <ul>{setup.anchors.map((a, i) => <li key={i}>{meaningLabel(a)} <button className="btn xs" onClick={() => change({ ...setup, anchors: setup.anchors.filter((_, at) => at !== i), available: [] })}>Remove anchor {i + 1}</button></li>)}</ul>
    {variants.map(m => {
      const key = stableKey(m), selected = setup.available.find(a => stableKey(a.meaning) === key)
      return <div key={key}><label><input type="checkbox" aria-label={`Can observe ${meaningLabel(m)}`} checked={!!selected} disabled={!selected && setup.available.length >= 64} onChange={e => change({ ...setup, available: e.target.checked ? [...setup.available, { kind: 'meaning', meaning: m, cost: 1 }] : setup.available.filter(a => stableKey(a.meaning) !== key) })} /> I can observe {meaningLabel(m)}</label>
        {selected && <label>Cost<input className="input" aria-label={`Cost for ${meaningLabel(m)}`} type="number" min={1} max={1000} value={selected.cost} onChange={e => { const cost = Number(e.target.value); if (Number.isFinite(cost) && cost >= 1 && cost <= 1000) change({ ...setup, available: setup.available.map(a => stableKey(a.meaning) !== key ? a : { ...a, cost }) }) }} /></label>}
      </div>
    })}
    <p className="dim">Costs are your declared effort units (1–1000); keep the unit consistent. A missing or ambiguous prediction prevents selection.</p>
  </fieldset>
}
