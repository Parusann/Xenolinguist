import { groundedDataset } from './corpus.js';
import { groundedSymbolic } from '../adapters/grounded-symbolic.js';
import { LexiconIndex } from '../../../engine/src/lexicon/index.js';
import { englishLemma } from '../../../engine/src/morphology/analyze.js';
import { derive } from '../../../engine/src/translation/derive.js';
import { key, ruleRecords, type Observation } from '../../../engine/src/induction/contracts.js';
import { normalize } from '../../../engine/src/text/normalize.js';
export const conditions=['regular','sparse','irregular','syncretism','segmentation-ambiguity'] as const;
export const methods=['memorization','repaired-lookup','learned-rules','oracle-rules'] as const;
export function experiment(seed:number,condition:typeof conditions[number]) {
  const data=groundedDataset(seed);
  if(condition==='sparse')data.input.fit=data.input.fit.slice(0,7);
  if(condition==='irregular') {
    const entry=data.input.dictionary[2],plural=data.oracle.find(c=>c.ast.kind==='plural-affix')!.ast;
    if(plural.kind!=='plural-affix')throw Error('fixture');
    const form=plural.position==='prefix'?plural.affix+entry.alien_word:entry.alien_word+plural.affix;
    data.withheld=data.withheld.map(o=>({...o,surface:o.surface.replaceAll(form,'suppletive')}));
  }
  if(condition==='syncretism') {
    const old=data.input.dictionary[1].alien_word,newForm=data.input.dictionary[0].alien_word;data.input.dictionary[1].alien_word=newForm;
    const replace=(o:Observation)=>({...o,surface:o.surface.replaceAll(old,newForm)});
    data.input.fit=data.input.fit.map(replace);data.input.validation=data.input.validation.map(replace);data.withheld=data.withheld.map(replace);
  }
  if(condition==='segmentation-ambiguity')data.input.dictionary[0].form_aliases=[data.input.validation[0].surface];
  // Only grounded fit/validation and lexical anchors cross into the learner.
  const learned=groundedSymbolic(data.input,data.withheld.map(({id,surface})=>({id,surface})));
  const rows=methods.map(method=>({method,predictions:data.withheld.map(o=>{
    let prediction:unknown=null,status='abstained',derivation:unknown;
    if(method==='learned-rules'){const p=learned.predictions.find(p=>p.id===o.id)!;prediction=p.meaning??null;status=p.status;derivation=p.derivation;}
    else if(method==='memorization') {const matches=[...data.input.fit,...data.input.validation].filter(t=>normalize(t.surface)===normalize(o.surface));if(matches.length&&new Set(matches.map(t=>key(t.meaning))).size===1){prediction=matches[0].meaning;status='answered';}}
    else if(method==='repaired-lookup') {
      const lexical=new LexiconIndex(data.input.dictionary,data.input.lexical_policy).analyze(o.surface),words=lexical.filter(t=>t.kind==='word');
      derivation=words.map(t=>({text:t.text,start:t.start,end:t.end,candidates:t.candidates.map(c=>({entryId:c.entry.id,sense:c.sense,meaning:c.meaning}))}));
      // Exact lookup may identify a single uninflected nominal. It has no rule
      // license for assigning clause roles, affixes or adjective attachment.
      if(words.length===1&&words[0].candidates.length===1) {
        const c=words[0].candidates[0],lemma=englishLemma(c.meaning,c.entry.part_of_speech);
        if(lemma&&['noun','pronoun'].includes(c.entry.part_of_speech)&&c.start===0&&c.end===o.surface.length){prediction={kind:'nominal',nominal:{head:{entryId:c.entry.id,sense:c.sense,lemma,pos:c.entry.part_of_speech},plural:false,adjectives:[],...(c.entry.english_plural?{englishPlural:c.entry.english_plural}:{})}};status='answered';}
      }
    }
    else {const parsed=derive(o.surface,{...data.input,grammar_rules:method==='oracle-rules'?ruleRecords(data.oracle):[]});if(new Set(parsed.candidates.map(c=>key(c.tree))).size===1){prediction=parsed.candidates[0].tree;derivation=parsed.candidates[0];status='answered';}}
    return {id:o.id,status,prediction,derivation,correct:prediction!==null&&key(prediction)===key(o.meaning)};
  })}));
  return {seed,condition,corpusVersion:data.version,input:data.input,withheld:data.withheld,oracle:data.oracle,induction:learned.induction,rows};
}
export type Experiment=ReturnType<typeof experiment>;
export function summary(records:Experiment[]) {
  return conditions.flatMap(condition=>methods.map(method=>{
    const items=records.filter(r=>r.condition===condition).flatMap(r=>r.rows.find(row=>row.method===method)!.predictions);
    return {condition,method,total:items.length,answered:items.filter(i=>i.status==='answered').length,correct:items.filter(i=>i.correct).length};
  }));
}
