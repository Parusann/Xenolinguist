import type { DictionaryEntry, ExecutableRule } from '../../../shared/types.js';
import type { Lexeme, MeaningTree, Nominal } from '../../../engine/src/grammar/ast.js';
import type { Observation, InductionInput, Candidate } from '../../../engine/src/induction/contracts.js';

export const CORPUS_VERSION='grounded-affixes-1';
export interface GroundedDataset { seed:number; version:typeof CORPUS_VERSION; input:InductionInput; withheld:Observation[]; oracle:Candidate[] }
/** A separate concatenative corpus. Only input is exposed to the learner.
 * This renderer does not call the workbench parser/generator. Lexical anchors are supplied. */
export function groundedDataset(seed:number):GroundedDataset {
  let state=seed>>>0;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
  const suffixes=['um','ek','is','ot','av','ul','im','ar'];
  const form=(i:number)=>{const value=next();return 'z'+suffixes[(value>>>28)%suffixes.length]+value.toString(36)+i;};
  const at='2026-09-22T00:00:00.000Z';
  const dictionary:DictionaryEntry[]=[...['star','stone','bird'].map((meaning,i)=>({id:'noun'+i,alien_word:form(i),english_meaning:meaning,part_of_speech:'noun' as const})),
    ...['see','follow','help'].map((meaning,i)=>({id:'verb'+i,alien_word:form(i+3),english_meaning:meaning,part_of_speech:'verb' as const,verb_frame:'transitive' as const})),
    {id:'adj',alien_word:form(6),english_meaning:'large',part_of_speech:'adjective' as const}].map(e=>({...e,confidence:null,context:'',examples:[],notes:'',created_at:at}));
  const prefix=!!(seed%2),order=(['SVO','SOV','VSO'] as const)[seed%3],before=!!(Math.floor(seed/2)%2),negBefore=!!(Math.floor(seed/4)%2);
  const asts:ExecutableRule[]=[{kind:'plural-affix',position:prefix?'prefix':'suffix',affix:prefix?'na-':'-en'},
    {kind:'tense-affix',position:prefix?'suffix':'prefix',affix:prefix?'-ta':'pa-',tense:'past'},
    {kind:'tense-affix',position:prefix?'prefix':'suffix',affix:prefix?'fu-':'-ri',tense:'future'},
    {kind:'negation',marker:'ix',position:negBefore?'before':'after'}, {kind:'adjective-order',position:before?'before':'after'}, {kind:'clause-order',order,arguments:2}];
  const oracle:Candidate[]=asts.map((ast,i)=>({id:'oracle-'+i,ast,support:[],stems:[],contrasts:[]}));
  const ref=(id:string):Lexeme=>{const e=dictionary.find(e=>e.id===id)!;return {entryId:id,sense:null,lemma:e.english_meaning,pos:e.part_of_speech as Lexeme['pos']};};
  const np=(i:number,plural=false,adjective=false):Nominal=>({head:ref('noun'+i),plural,adjectives:adjective?[ref('adj')]:[]});
  const clause=(verb:number,tense:'present'|'past'|'future'='present',negated=false,plural=false,adj=false,reverse=false):MeaningTree=>({kind:'clause',subject:np(reverse?2:0),object:np(reverse?0:2,plural,adj),verb:ref('verb'+verb),tense,negated});
  const affix=(base:string,kind:'plural-affix'|'tense-affix',tense?:string)=>{const ast=asts.find(a=>a.kind===kind&&(a.kind!=='tense-affix'||a.tense===tense))!;if(ast.kind!==kind)throw Error('fixture');return ast.position==='prefix'?ast.affix+base:base+ast.affix;};
  const base=(r:Lexeme)=>dictionary.find(e=>e.id===r.entryId)!.alien_word;
  const nominal=(n:Nominal)=>{const head=n.plural?affix(base(n.head),'plural-affix'):base(n.head),adjs=n.adjectives.map(base);return (before?[...adjs,head]:[head,...adjs]).join(' ');};
  const surface=(tree:MeaningTree)=>{if(tree.kind==='nominal')return nominal(tree.nominal);let v=tree.tense==='present'?base(tree.verb):affix(base(tree.verb),'tense-affix',tree.tense);if(tree.negated)v=negBefore?'ix '+v:v+' ix';const roles:Record<string,string>={S:nominal(tree.subject),O:nominal(tree.object!),V:v};return [...order].map(r=>roles[r]).join(' ');};
  const fit:Observation[]=[],validation:Observation[]=[],withheld:Observation[]=[];
  const add=(partition:Observation[],meaning:MeaningTree)=>partition.push({id:(partition===fit?'fit':partition===validation?'validation':'withheld')+'-'+partition.length,surface:surface(meaning),meaning});
  for(const i of [0,1]) {add(fit,{kind:'nominal',nominal:np(i)});add(fit,{kind:'nominal',nominal:np(i,true)});add(fit,{kind:'nominal',nominal:np(i,false,true)});
    add(fit,clause(i));add(fit,clause(i,'past'));add(fit,clause(i,'future'));add(fit,clause(i,'present',true));}
  add(validation,{kind:'nominal',nominal:np(2,true)});add(validation,{kind:'nominal',nominal:np(2,false,true)});
  add(validation,clause(2));add(validation,clause(2,'past'));add(validation,clause(2,'future'));add(validation,clause(2,'present',true));
  add(withheld,clause(2,'past',true,true,true));add(withheld,clause(2,'future',true,true,true,true));add(withheld,clause(1,'present',false,true,true,true));add(withheld,{kind:'nominal',nominal:np(2,true,true)});
  return {seed,version:CORPUS_VERSION,input:{dictionary,fit,validation},withheld,oracle};
}
