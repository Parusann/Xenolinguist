import type { Lexeme, MeaningTree } from '../grammar/ast.js';
import { normalize } from '../text/normalize.js';
import { graphemes } from '../text/spans.js';
import type { AnchorProfile, Candidate, Observation } from './contracts.js';
import { literalBits } from './mdl.js';

export function anchoredForms(ref: Lexeme, profile: AnchorProfile): string[] {
  const entry = profile.dictionary.find(e => e.id === ref.entryId);
  return entry ? [entry.alien_word, ...(entry.form_aliases ?? [])].map(s => normalize(s.trim(), profile.lexical_policy)) : [];
}
export function tokens(surface: string): string[] { return surface.replace(/[.!?]\s*$/u, '').split(/\s+/u); }
export function positions(ref: Lexeme, observation: Observation, profile: AnchorProfile): number[] {
  const forms = anchoredForms(ref, profile);
  return tokens(observation.surface).flatMap((token,i) => forms.some(f => normalize(token,profile.lexical_policy) === f) ? [i] : []);
}
export function nominalFeatures(tree: MeaningTree) { return tree.kind === 'nominal' ? [tree.nominal] : [tree.subject, ...(tree.object ? [tree.object] : [])]; }

export interface Segment { text: string; start: number; end: number; entryId?: string; ruleId?: string; unknown?: true }
/** Viterbi-style DP over original grapheme boundaries, with literal fallback.
 * State tracks whether the single lexical stem has been consumed. This is a
 * morphology coding aid; complete grammatical correctness still uses derive(). */
export function segment(token: string, profile: AnchorProfile, candidates: readonly Candidate[]): { cost: number; segments: Segment[] } {
  const boundaries = [...graphemes(token).map(g => g.start), token.length];
  const rows = new Map<string,{cost:number;segments:Segment[]}>(); rows.set('0:0',{cost:0,segments:[]});
  for (let i=0;i<boundaries.length-1;i++) for (const used of [0,1]) {
    const old=rows.get(`${i}:${used}`); if(!old) continue;
    for(let j=i+1;j<boundaries.length;j++) {
      const text=token.slice(boundaries[i],boundaries[j]), normalized=normalize(text,profile.lexical_policy);
      const choices: {entryId?:string;ruleId?:string;unknown?:true;next:number;cost:number}[]=[];
      if(!used) for(const e of profile.dictionary) if([e.alien_word,...(e.form_aliases??[])].some(f=>normalize(f.trim(),profile.lexical_policy)===normalized)) choices.push({entryId:e.id,next:1,cost:1+Math.ceil(Math.log2(profile.dictionary.length+1))});
      for(const c of candidates) if((c.ast.kind==='plural-affix'||c.ast.kind==='tense-affix') && normalize(c.ast.affix,profile.lexical_policy)===normalized && (c.ast.position==='prefix' ? !used&&i===0 : !!used&&j===boundaries.length-1)) choices.push({ruleId:c.id,next:used,cost:1+Math.ceil(Math.log2(candidates.length+1))});
      if(j===i+1) choices.push({unknown:true,next:used,cost:literalBits(text)+1});
      for(const choice of choices) {
        const value={cost:old.cost+choice.cost,segments:[...old.segments,{text,start:boundaries[i],end:boundaries[j],...(choice.entryId?{entryId:choice.entryId}:{}),...(choice.ruleId?{ruleId:choice.ruleId}:{}),...(choice.unknown?{unknown:true as const}:{})}]};
        const k=`${j}:${choice.next}`;if(!rows.has(k)||rows.get(k)!.cost>value.cost) rows.set(k,value);
      }
    }
  }
  return [rows.get(`${boundaries.length-1}:0`),rows.get(`${boundaries.length-1}:1`)].filter(v=>v!==undefined).sort((a,b)=>a.cost-b.cost)[0] ?? {cost:literalBits(token),segments:[]};
}
