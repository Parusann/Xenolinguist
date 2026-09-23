import { describe,it,expect } from 'vitest';
import { induceGrounded, evaluate } from '../induction/candidate-search.js';
import { segment } from '../induction/alignments.js';
import { integerBits, literalBits, ruleBits } from '../induction/mdl.js';
import { key } from '../induction/contracts.js';
import { experiment } from '../../../evaluation/src/induction/experiment.js';
import { groundedDataset } from '../../../evaluation/src/induction/corpus.js';

describe('grounded induction',()=>{
 it.each([100,101,102])('learns seed %s rules without receiving the oracle and predicts withheld compositions',seed=>{
  const data=groundedDataset(seed),result=induceGrounded(data.input);
  expect(result.status,JSON.stringify(result)).toBe('proposed');
  expect(result.proposals).toHaveLength(6);
  expect(evaluate(data.withheld,data.input,result.proposals).every(o=>o.correct)).toBe(true);
  expect(result.validation?.ablations.every(a=>a.outcomes.filter(o=>o.correct).length<result.validation!.selected.filter(o=>o.correct).length)).toBe(true);
 });
 it('deduplicates identical evidence and rejects cross-partition leakage and conflicting grounding',()=>{
  const data=groundedDataset(100),input=structuredClone(data.input);
  input.fit.push({...input.fit[0],id:'duplicate'});const result=induceGrounded(input);
  expect(result.duplicatesRemoved).toBe(1);expect(result.fitCount).toBe(data.input.fit.length);
  expect(key(result.proposals)).toBe(key(induceGrounded(data.input).proposals));
  input.validation.push({...input.fit[0],id:'leaked'});expect(induceGrounded(input).status).toBe('invalid');
  const conflict=structuredClone(data.input);conflict.fit.push({...conflict.fit[0],id:'conflict',meaning:conflict.fit[1].meaning});expect(induceGrounded(conflict).status).toBe('invalid');
 });
 it('does not turn copies from one stem into independent morphology support',()=>{
  const data=groundedDataset(100),input={...data.input,fit:[...data.input.fit.slice(0,2),{...data.input.fit[1],id:'copy'}]};
  const result=induceGrounded(input);expect(result.proposals).toEqual([]);expect(result.rejected.some(r=>r.ast.kind==='plural-affix')).toBe(true);
 });
 it('requires independent validation improvement and never extracts rules from validation',()=>{
  const data=groundedDataset(100),input={...data.input,fit:data.input.fit.filter(o=>o.meaning.kind==='nominal'&&!o.meaning.nominal.plural)};
  expect(induceGrounded(input).candidates.some(c=>c.ast.kind==='plural-affix')).toBe(false);
  const bad=structuredClone(data.input);bad.validation=bad.validation.map(o=>({...o,surface:'unknown '+o.surface}));expect(induceGrounded(bad).proposals).toEqual([]);
 });
 it('rejects unbound semantic references and bounded-input overflow',()=>{
  const data=groundedDataset(100),bad=structuredClone(data.input);bad.fit[0].meaning={kind:'nominal',nominal:{head:{entryId:'missing',lemma:'x',sense:null,pos:'noun'},plural:false,adjectives:[]}};
  expect(induceGrounded(bad).status).toBe('invalid');expect(induceGrounded({...data.input,fit:Array(49).fill(data.input.fit[0])}).status).toBe('invalid');
  expect(induceGrounded({...data.input,hiddenRules:data.oracle}).status).toBe('invalid');
 });
 it.each(['sparse','syncretism','segmentation-ambiguity'] as const)('retains explicit failure for %s',condition=>{
  const result=experiment(100,condition);expect(result.rows.find(r=>r.method==='learned-rules')!.predictions.every(p=>p.status==='abstained')).toBe(true);
 });
 it('leaves irregular withheld morphology unresolved while keeping supported predictions',()=>{
  const result=experiment(100,'irregular').rows.find(r=>r.method==='learned-rules')!;expect(result.predictions.filter(p=>p.correct)).toHaveLength(2);expect(result.predictions.filter(p=>p.status==='abstained')).toHaveLength(2);
 });
 it('canonical keys survive JSON persistence without undefined-property artifacts',()=>{
  const value={z:undefined,meaning:{x:1,a:[2,3]}};expect(key(value)).toBe(key(JSON.parse(JSON.stringify(value))));
 });
 it('uses tested byte coding and dynamic programming with original segmentation spans',()=>{
  expect(integerBits(1)).toBe(1);expect(integerBits(4)).toBe(5);expect(()=>integerBits(0)).toThrow();expect(literalBits('水')).toBe(29);
  const data=groundedDataset(100),token=data.input.fit[1].surface,parts=segment(token,data.input,data.oracle);
  expect(parts.segments.some(s=>s.ruleId)).toBe(true);expect(parts.segments.some(s=>s.entryId==='noun0')).toBe(true);
  for(const s of parts.segments)expect(token.slice(s.start,s.end)).toBe(s.text);
  expect(ruleBits(data.oracle[0].ast)).toBeGreaterThan(0);
 });
});
