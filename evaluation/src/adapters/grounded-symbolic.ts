import { induceGrounded } from '../../../engine/src/induction/candidate-search.js';
import { derive } from '../../../engine/src/translation/derive.js';
import { key, ruleRecords, type InductionInput } from '../../../engine/src/induction/contracts.js';

/** New contract/version; frozen W15 symbolic/hybrid adapters are not reinterpreted. */
export function groundedSymbolic(input:InductionInput,surfaces:{id:string;surface:string}[]) {
  const induction=induceGrounded(input);
  const predictions=surfaces.map(o=>{
    if(induction.status!=='proposed')return {id:o.id,status:'abstained',reason:induction.status};
    const result=derive(o.surface,{dictionary:input.dictionary,lexical_policy:input.lexical_policy,grammar_rules:ruleRecords(induction.proposals)});
    const meanings=new Set(result.candidates.map(c=>key(c.tree)));
    return meanings.size===1?{id:o.id,status:'answered',meaning:result.candidates[0].tree,derivation:result.candidates[0]}:{id:o.id,status:'abstained',reason:result.status};
  });
  return {induction,predictions};
}
