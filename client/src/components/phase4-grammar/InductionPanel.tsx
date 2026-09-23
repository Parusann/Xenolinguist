import { z } from 'zod'
import { meaningTreeSchema } from 'engine/morphology/generate'
import { useEffect, useRef, useState } from 'react'
import type { DictionaryEntry, ExecutableRule, LanguageProfile } from 'shared/types'
import type { Lexeme, MeaningTree, Nominal } from 'engine/grammar/ast'
import { englishLemma } from 'engine/morphology/analyze'
import { sensesOf } from 'engine/lexicon/senses'
import { key, type InductionResult, type Observation } from 'engine/induction/contracts'
import { useProfile } from '@/stores/profile-context'
import { useProfileDraft } from '@/hooks/useProfileDraft'

const groundingDraftSchema=z.array(z.strictObject({sampleId:z.string().min(1).max(128),partition:z.enum(['fit','validation']),meaning:meaningTreeSchema})).max(96)
type Grounding = { sampleId:string; partition:'fit'|'validation'; meaning:MeaningTree }
function ruleLabel(rule:ExecutableRule):string {
  if(rule.kind==='plural-affix')return `Plural ${rule.position} “${rule.affix}”`
  if(rule.kind==='tense-affix')return `${rule.tense} tense ${rule.position} “${rule.affix}”`
  if(rule.kind==='negation')return `Negation “${rule.marker}” ${rule.position} the verb`
  if(rule.kind==='adjective-order')return `Adjectives ${rule.position} the noun`
  return `${rule.order} order with ${rule.arguments} argument${rule.arguments===1?'':'s'}`
}
export function InductionPanel({profile}:{profile:LanguageProfile}) {
  const { updateProfile } = useProfile()
  const [stored,setStored] = useProfileDraft<string>('grammar.groundings','[]')
  const [sample,setSample] = useState(''), [partition,setPartition] = useState<'fit'|'validation'>('fit')
  const [kind,setKind] = useState<'nominal'|'clause'>('nominal')
  const [subject,setSubject] = useState(''),[object,setObject] = useState(''),[verb,setVerb] = useState(''),[adjective,setAdjective] = useState('')
  const [plural,setPlural] = useState(false),[tense,setTense] = useState<'present'|'past'|'future'>('present'),[negated,setNegated] = useState(false)
  const [result,setResult] = useState<{value:InductionResult;fingerprint:string}|null>(null),[error,setError] = useState(''),[busy,setBusy] = useState(false)
  const workerRef=useRef<Worker|null>(null),timerRef=useRef<ReturnType<typeof setTimeout>|null>(null)
  useEffect(()=>()=>{workerRef.current?.terminate();if(timerRef.current)clearTimeout(timerRef.current)},[])
  let groundings:Grounding[]=[],draftError=''
  try { groundings=groundingDraftSchema.parse(JSON.parse(stored)) } catch { draftError='Stored grounding draft is invalid. Its original data is retained.' }
  const fingerprint=key({dictionary:profile.dictionary,samples:profile.samples,policy:profile.lexical_policy,grammar:profile.grammar_rules,stored})
  const stale=!!result&&result.fingerprint!==fingerprint
  const usable=profile.dictionary.filter(e=>['noun','pronoun','verb','adjective'].includes(e.part_of_speech)&&englishLemma(sensesOf(e)[0].meaning,e.part_of_speech))
  const lexeme=(id:string):Lexeme=>{const e=usable.find(e=>e.id===id);if(!e)throw Error('Select every required lexical anchor.');const sense=sensesOf(e)[0];return {entryId:id,sense:sense.sense,lemma:englishLemma(sense.meaning,e.part_of_speech)!,pos:e.part_of_speech as Lexeme['pos']}}
  const add=()=>{try {
    if(draftError)throw Error(draftError);
    if(!profile.samples.some(s=>s.id===sample))throw Error('Select a saved sample.');
    if(groundings.some(g=>g.sampleId===sample))throw Error('This sample already has a grounding; remove it before revising.');
    if(groundings.length>=96)throw Error('Use at most 48 fit and 48 validation observations.');
    const noun=(id:string,modified=false):Nominal=>({head:lexeme(id),plural:modified&&plural,adjectives:modified&&adjective?[lexeme(adjective)]:[],...(usable.find(e=>e.id===id)?.english_plural?{englishPlural:usable.find(e=>e.id===id)!.english_plural!}:{})})
    const meaning:MeaningTree=kind==='nominal'?{kind,nominal:noun(subject,true)}:{kind,subject:noun(subject),...(object?{object:noun(object,true)}:{}),verb:lexeme(verb),tense,negated}
    setStored(JSON.stringify([...groundings,{sampleId:sample,partition,meaning}]));setError('')
  }catch(e){setError(String(e))}}
  const cancel=()=>{workerRef.current?.terminate();workerRef.current=null;if(timerRef.current)clearTimeout(timerRef.current);setBusy(false)}
  const run=()=>{try {
    if(draftError)throw Error(draftError);
    if(stored.length>150000)throw Error('Grounding draft is too large.');
    const data:unknown=JSON.parse(stored);if(!Array.isArray(data))throw Error('Invalid grounding draft.');
    const fit:Observation[]=[],validation:Observation[]=[]
    for(const g of groundings){const observation=profile.samples.find(s=>s.id===g.sampleId);if(!observation)throw Error('A grounded sample was removed. Review the observations.');if(g.partition!=='fit'&&g.partition!=='validation')throw Error('Invalid observation partition.');(g.partition==='fit'?fit:validation).push({id:g.sampleId,surface:observation.alien_text,meaning:g.meaning})}
    cancel();setError('');setResult(null);setBusy(true)
    const worker=new Worker(new URL('../../workers/induction.worker.ts',import.meta.url),{type:'module'});workerRef.current=worker
    worker.onmessage=(event:MessageEvent<InductionResult>)=>{setResult({value:event.data,fingerprint});cancel()}
    worker.onerror=()=>{setError('Induction failed. Your observations are retained.');cancel()}
    timerRef.current=setTimeout(()=>{setError('Induction exceeded the 15-second budget. Reduce the observation set.');cancel()},15000)
    worker.postMessage({dictionary:profile.dictionary,lexical_policy:profile.lexical_policy,fit,validation})
  }catch(e){setError(String(e));cancel()}}
  const accept=()=>{
    if(!result||stale||result.value.status!=='proposed')return
    const evidence=[`Grounded induction ${result.value.version}; manual acceptance; description-length rank is not probability.`,...groundings.map(g=>JSON.stringify({...g,surface:profile.samples.find(s=>s.id===g.sampleId)?.alien_text})),JSON.stringify(result.value.validation)]
    const fresh=result.value.proposals.filter(c=>!profile.grammar_rules.some(r=>r.executable&&key(r.executable)===key(c.ast)))
    updateProfile({grammar_rules:[...profile.grammar_rules,...fresh.map(c=>({id:'rule-'+crypto.randomUUID(),rule:`Accepted grounded proposal: ${c.ast.kind}`,executable:c.ast,evidence,confidence:null,created_at:new Date().toISOString()}))]})
    setResult(null)
  }
  const select=(label:string,value:string,set:(value:string)=>void,entries:DictionaryEntry[],optional=false)=><label className="label">{label}<select className="input" aria-label={label} value={value} onChange={e=>set(e.target.value)}><option value="">{optional?'None':'Choose an anchor'}</option>{entries.map(e=><option key={e.id} value={e.id}>{e.alien_word} = {sensesOf(e)[0].meaning}</option>)}</select></label>
  const nouns=usable.filter(e=>e.part_of_speech==='noun'||e.part_of_speech==='pronoun')
  return <section className="glass-card" aria-label="Grounded rule learning" style={{padding:16}}>
    <h2 style={{fontSize:18}}>Learn from grounded observations</h2>
    <p className="dim">Assign known meanings to saved samples. Fit observations generate and rank rules; distinct validation observations must improve before acceptance. Known lexical anchors and verb frames are required. No model is called.</p>
    <details><summary>Assign a known meaning</summary>
    <label className="label">Grounded sample<select className="input" aria-label="Grounded sample" value={sample} onChange={e=>setSample(e.target.value)}><option value="">Choose a saved sample</option>{profile.samples.map(s=><option key={s.id} value={s.id}>{s.alien_text}</option>)}</select></label>
    <label className="label">Observation use<select className="input" aria-label="Observation use" value={partition} onChange={e=>setPartition(e.target.value as typeof partition)}><option value="fit">Fit rules</option><option value="validation">Validate unseen forms</option></select></label>
    <label className="label">Meaning shape<select className="input" aria-label="Meaning shape" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="nominal">Noun phrase</option><option value="clause">Clause</option></select></label>
    {select('Subject or noun',subject,setSubject,nouns)}
    {kind==='clause'&&<>{select('Predicate',verb,setVerb,usable.filter(e=>e.part_of_speech==='verb'))}{select('Object',object,setObject,nouns,true)}<label className="label">Tense<select className="input" aria-label="Grounded tense" value={tense} onChange={e=>setTense(e.target.value as typeof tense)}>{['present','past','future'].map(t=><option key={t}>{t}</option>)}</select></label><label><input type="checkbox" checked={negated} onChange={e=>setNegated(e.target.checked)}/> Negated</label></>}
    <p className="dim">Plurality and adjective modify the noun phrase, or the clause object. This editor uses the first explicit sense; use separate entries for other meanings.</p>
    <label><input type="checkbox" checked={plural} onChange={e=>setPlural(e.target.checked)}/> Grounded plural</label>
    {select('Grounded adjective',adjective,setAdjective,usable.filter(e=>e.part_of_speech==='adjective'),true)}
    <button className="btn sm" onClick={add}>Add grounded observation</button>
    </details>
    {draftError&&<p role="alert">{draftError}</p>}
    <ul style={{paddingLeft:16}}>{groundings.map((g,i)=><li key={g.sampleId+':'+i}>{g.partition}: {profile.samples.find(s=>s.id===g.sampleId)?.alien_text??'Missing sample'} <button className="btn xs" aria-label={`Remove grounding ${i+1}`} onClick={()=>setStored(JSON.stringify(groundings.filter((_,j)=>j!==i)))}>Remove</button></li>)}</ul>
    <button className="btn sm primary" disabled={busy} onClick={run}>Infer grounded rules</button>{busy&&<button className="btn sm" onClick={cancel}>Cancel induction</button>}
    {error&&<p role="alert">{error}</p>}
    {result&&<div data-testid="induction-result"><p role="status">{stale?'Observations or profile changed. Run induction again.':result.value.status}</p>
      {result.value.diagnostics.map((d,i)=><p key={i}>{d}</p>)}
      <p>{result.value.fitCount} distinct fit observations · {result.value.validationCount} validation · {result.value.duplicatesRemoved} duplicates removed · {result.value.evaluations} rule sets evaluated</p>
      {result.value.validation&&<p>Validation: {result.value.validation.selected.filter(o=>o.correct).length}/{result.value.validation.selected.length} correct; no-rule baseline {result.value.validation.baseline.filter(o=>o.correct).length}/{result.value.validation.baseline.length}.</p>}
      <details><summary>Alternatives, support and rejection reasons</summary><pre style={{fontSize:11,whiteSpace:'pre-wrap'}}>{JSON.stringify(result.value,null,2)}</pre></details>
      {result.value.proposals.map(c=><p key={c.id}>{ruleLabel(c.ast)} · {c.support.length} observations · {c.stems.length} stems/predicates</p>)}
      <button className="btn sm primary" disabled={stale||result.value.status!=='proposed'} onClick={accept}>Accept proposed rules</button>
      <button className="btn sm" onClick={()=>setResult(null)}>Dismiss proposals</button>
      <p className="dim">Acceptance stores the proposed rules with their grounding and validation record. Existing manual rules remain; conflicts can produce ambiguous translations. Captured evidence is a historical note; later edits do not rewrite it.</p>
    </div>}
  </section>
}
