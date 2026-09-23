import type { ExecutableRule } from '../../../shared/types.js';
import { executableRuleSchema } from '../../../shared/schemas/grammar.js';
import { normalize } from '../text/normalize.js';
import { anchoredForms, nominalFeatures, tokens } from './alignments.js';
import { key, type AnchorProfile, type Observation } from './contracts.js';

export interface EvidenceCandidate { ast: ExecutableRule; support:Set<string>; stems:Set<string>; contrasts:Set<string> }
export function affixes(observations: Observation[], profile: AnchorProfile): EvidenceCandidate[] {
  const pool=new Map<string,EvidenceCandidate>();
  for(const observation of observations) {
    const features=[...nominalFeatures(observation.meaning).filter(n=>n.plural).map(n=>({ref:n.head,kind:'plural-affix' as const,tense:undefined})),
      ...(observation.meaning.kind==='clause'&&observation.meaning.tense!=='present'?[{ref:observation.meaning.verb,kind:'tense-affix' as const,tense:observation.meaning.tense}]:[])];
    for(const feature of features) {
      const forms=anchoredForms(feature.ref,profile);
      const contrasts=observations.filter(o=>tokens(o.surface).some(t=>forms.includes(normalize(t,profile.lexical_policy))) && (feature.kind==='plural-affix'
        ? nominalFeatures(o.meaning).some(n=>n.head.entryId===feature.ref.entryId&&!n.plural)
        : o.meaning.kind==='clause'&&o.meaning.verb.entryId===feature.ref.entryId&&o.meaning.tense==='present'));
      if(!contrasts.length) continue;
      for(const token of tokens(observation.surface).map(t=>normalize(t,profile.lexical_policy))) for(const base of forms) for(const position of ['prefix','suffix'] as const) {
        if(!base||token===base||!(position==='prefix'?token.endsWith(base):token.startsWith(base))) continue;
        const affix=position==='prefix'?token.slice(0,-base.length):token.slice(base.length);
        const ast:ExecutableRule=feature.kind==='plural-affix'?{kind:feature.kind,position,affix}:{kind:feature.kind,position,affix,tense:feature.tense!};
        if(!executableRuleSchema.safeParse(ast).success) continue;
        const k=key(ast), record=pool.get(k)??{ast,support:new Set<string>(),stems:new Set<string>(),contrasts:new Set<string>()};
        record.support.add(observation.id); record.stems.add(feature.ref.entryId); contrasts.forEach(o=>record.contrasts.add(o.id));pool.set(k,record);
      }
    }
  }
  return [...pool.values()];
}
