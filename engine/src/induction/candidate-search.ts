import { derive } from '../translation/derive.js';
import { generate } from '../morphology/generate.js';
import { normalize } from '../text/normalize.js';
import { affixes } from './affixes.js';
import { wordOrder } from './word-order.js';
import { segment, tokens } from './alignments.js';
import { lexiconBits, ruleBits, exceptionBits, explainedBits } from './mdl.js';
import { INDUCTION_VERSION, SEARCH, inductionInputSchema, key, lexemes, ruleRecords,
  type AnchorProfile, type Candidate, type Observation, type Outcome, type Scored, type InductionResult } from './contracts.js';

export function evaluate(observations:Observation[],profile:AnchorProfile,candidates:Candidate[]):Outcome[] {
  const data={...profile,grammar_rules:ruleRecords(candidates)};
  return observations.map(o=>{
    const result=derive(o.surface,data), meanings=new Set(result.candidates.map(c=>key(c.tree)));
    const correct=meanings.size===1&&meanings.has(key(o.meaning));
    return {id:o.id,correct,status:result.status,ruleIds:correct?[...new Set(result.candidates.flatMap(c=>c.ruleIds))]:[]};
  });
}
const slot=(c:Candidate)=>c.ast.kind==='tense-affix'?c.ast.kind+':'+c.ast.tense:c.ast.kind==='clause-order'?c.ast.kind+':'+c.ast.arguments:c.ast.kind;

export function induceGrounded(raw:unknown):InductionResult {
  const result:InductionResult={version:INDUCTION_VERSION,status:'invalid',diagnostics:[],candidates:[],rejected:[],alternatives:[],proposals:[],fitCount:0,validationCount:0,duplicatesRemoved:0,evaluations:0};
  try {
    const parsed=inductionInputSchema.safeParse(raw);if(!parsed.success) throw new Error('Invalid grounded input: '+parsed.error.issues.map(i=>i.path.join('.')+': '+i.message).slice(0,5).join('; '));
    const input=parsed.data, profile:AnchorProfile={dictionary:input.dictionary,lexical_policy:input.lexical_policy};
    if(new Set(input.dictionary.map(e=>e.id)).size!==input.dictionary.length) throw new Error('Duplicate dictionary identifiers.');
    if(input.dictionary.some(e=>[e.alien_word,...(e.form_aliases??[])].some(f=>f.length>64||/\s/u.test(f.trim()))||(e.form_aliases?.length??0)>8||(e.senses?.length??0)>8)) throw new Error('Induction anchors require single-token forms up to 64 characters and at most eight aliases/senses.');
    const seen=new Map<string,string>(), ids=new Set<string>();
    const dedupe=(observations:Observation[],partition:string)=>observations.filter(o=>{
      if(ids.has(o.id)) throw new Error('Observation IDs must be unique across partitions.');ids.add(o.id);
      if(tokens(o.surface).length>16||tokens(o.surface).some(t=>t.length>64)) throw new Error('Induction supports at most 16 tokens of 64 characters.');
      if(lexemes(o.meaning).some(ref=>!input.dictionary.some(e=>e.id===ref.entryId))) throw new Error('Grounding references an unknown dictionary entry.');
      const bound=generate(o.meaning,{...profile,grammar_rules:[]});
      if(bound.status==='invalid'||bound.status==='limit') throw new Error('Grounding is incompatible with its lexical anchors: '+bound.diagnostics.join('; '));
      const surface=normalize(tokens(o.surface).join(' '),profile.lexical_policy), prior=seen.get(surface), meaning=key(o.meaning);
      if(prior&&prior!==partition+':'+meaning) throw new Error('Contradictory grounding or surface overlap between fit and validation.');
      if(prior){result.duplicatesRemoved++;return false;}seen.set(surface,partition+':'+meaning);return true;
    });
    const fit=dedupe(input.fit,'fit'),validation=dedupe(input.validation,'validation');
    result.fitCount=fit.length;result.validationCount=validation.length;
    const rawCandidates=[...affixes(fit,profile),...wordOrder(fit,profile)].sort((a,b)=>key(a.ast).localeCompare(key(b.ast),'en'));
    for(const c of rawCandidates) {
      if(c.support.size<2||c.stems.size<2){result.rejected.push({ast:c.ast,reason:'Requires two distinct fit observations and two anchored stems/predicates.'});continue;}
      result.candidates.push({id:'induced-'+result.candidates.length,ast:c.ast,support:[...c.support].sort(),stems:[...c.stems].sort(),contrasts:[...c.contrasts].sort()});
    }
    if(result.candidates.length>SEARCH.candidates){result.status='limit';result.diagnostics.push('Candidate limit exceeded; no proposal.');return result;}
    const lexBits=lexiconBits(profile), cache=new Map<string,Scored>();
    const score=(selected:Candidate[]):Scored=>{
      const signature=selected.map(c=>c.id).sort().join('|'),cached=cache.get(signature);if(cached)return cached;
      if(++result.evaluations>SEARCH.evaluations) throw new Error('SEARCH_LIMIT');
      const outcomes=evaluate(fit,profile,selected),rules=selected.reduce((sum,c)=>sum+ruleBits(c.ast),0);
      const data=fit.reduce((sum,o,i)=>sum+(outcomes[i].correct ? explainedBits(tokens(o.surface).length,profile.dictionary.length,selected.length)+tokens(o.surface).reduce((n,t)=>n+segment(t,profile,selected).cost,0) : exceptionBits(o)),0);
      const value={candidateIds:selected.map(c=>c.id).sort(),cost:lexBits+rules+data,lexiconBits:lexBits,ruleBits:rules,dataBits:data,outcomes};cache.set(signature,value);return value;
    };
    let beam:Candidate[][]=[[]];score([]);
    for(let depth=1;depth<=SEARCH.depth;depth++) {
      const expanded=new Map<string,Candidate[]>();
      for(const current of beam) for(const c of result.candidates) {
        if(current.some(old=>slot(old)===slot(c)))continue;
        const next=[...current,c].sort((a,b)=>a.id.localeCompare(b.id,'en')),signature=next.map(c=>c.id).join('|');
        if(!expanded.has(signature)){score(next);expanded.set(signature,next);}
      }
      if(!expanded.size)break;
      beam=[...expanded.values()].sort((a,b)=>score(a).cost-score(b).cost||key(a.map(c=>c.id)).localeCompare(key(b.map(c=>c.id)),'en')).slice(0,SEARCH.beam);
    }
    const ranked=[...cache.values()].sort((a,b)=>a.cost-b.cost||key(a.candidateIds).localeCompare(key(b.candidateIds),'en'));
    result.alternatives=ranked.slice(0,SEARCH.alternatives);
    const best=ranked[0];
    if(!best.candidateIds.length){result.status='insufficient';result.diagnostics.push('No supported rule set improves the description length over literal exceptions.');return result;}
    if(ranked[1]?.cost===best.cost){result.status='ambiguous';result.diagnostics.push('Equal-cost rule sets remain; no unique proposal.');return result;}
    const selected=result.candidates.filter(c=>best.candidateIds.includes(c.id)),baseline=evaluate(validation,profile,[]),outcomes=evaluate(validation,profile,selected);
    const ablations=selected.map(c=>({removed:c.id,outcomes:evaluate(validation,profile,selected.filter(other=>other.id!==c.id))}));
    result.validation={baseline,selected:outcomes,ablations};
    const count=(values:Outcome[])=>values.filter(o=>o.correct).length;
    const improves=count(outcomes)>count(baseline)&&ablations.every(a=>count(outcomes)>count(a.outcomes));
    const regressions=outcomes.some((o,i)=>baseline[i].correct&&!o.correct);
    if(!improves||regressions||[...best.outcomes,...outcomes].some(o=>o.status==='limit')) {
      result.status='insufficient';result.diagnostics.push('Selected fit rules lack independent validation gain for every rule, regress a baseline item, or hit a parse limit. No rule is offered for acceptance.');return result;
    }
    result.status='proposed';result.proposals=selected;
    result.diagnostics.push('Ranked only on fit observations. Each proposed rule improves validation when compared with its removal. Manual acceptance is still required. Beam search is approximate; coding scores are not probabilities.');
    for(const c of result.candidates.filter(c=>!best.candidateIds.includes(c.id)))result.rejected.push({ast:c.ast,reason:'Not selected by the bounded fit description-length search.'});
    return result;
  } catch(error) {
    result.status=error instanceof Error&&error.message==='SEARCH_LIMIT'?'limit':'invalid';result.proposals=[];result.diagnostics.push(String(error));return result;
  }
}
