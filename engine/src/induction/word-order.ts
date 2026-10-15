import type { ExecutableRule } from '../../../shared/types.js';
import { executableRuleSchema } from '../../../shared/schemas/grammar.js';
import { clauseRoles } from '../grammar/transforms.js';
import { key, type AnchorProfile, type Observation } from './contracts.js';
import { nominalFeatures, positions, tokens } from './alignments.js';
import type { EvidenceCandidate } from './affixes.js';

export function wordOrder(observations:Observation[],profile:AnchorProfile):EvidenceCandidate[] {
  const pool=new Map<string,EvidenceCandidate>();
  const add=(ast:ExecutableRule,o:Observation,stem:string,contrasts:string[]=[])=>{
    const k=key(ast),r=pool.get(k)??{ast,support:new Set<string>(),stems:new Set<string>(),contrasts:new Set<string>()};
    r.support.add(o.id);r.stems.add(stem);contrasts.forEach(id=>r.contrasts.add(id));pool.set(k,r);
  };
  for(const o of observations) {
    for(const n of nominalFeatures(o.meaning)) for(const adjective of n.adjectives) {
      const heads=positions(n.head,o,profile), modifiers=positions(adjective,o,profile);
      if(heads.length===1&&modifiers.length===1&&Math.abs(heads[0]-modifiers[0])<=n.adjectives.length)
        add({kind:'adjective-order',position:modifiers[0]<heads[0]?'before':'after'},o,n.head.entryId);
    }
    if(o.meaning.kind!=='clause') continue;
    const tree=o.meaning, roles={S:positions(tree.subject.head,o,profile),V:positions(tree.verb,o,profile),O:tree.object?positions(tree.object.head,o,profile):[]};
    for(const order of ['SVO','SOV','VSO'] as const) {
      if(!tree.object&&order==='SOV') continue; // SV is observationally identical; retain one canonical representative.
      const ordered=clauseRoles(order,tree.object?2:1).map(r=>roles[r as keyof typeof roles]);
      if(ordered.every(p=>p.length===1)&&ordered.every((p,i)=>!i||ordered[i-1][0]<p[0])) add({kind:'clause-order',order,arguments:tree.object?2:1},o,tree.verb.entryId);
    }
    if(!tree.negated) continue;
    const contrasts=observations.filter(other=>key(other.meaning)===key({...tree,negated:false}));
    const words=tokens(o.surface);
    for(let i=0;i<words.length;i++) {
      const matches=contrasts.filter(other=>tokens(other.surface).join(' ')===words.filter((_,j)=>i!==j).join(' '));
      if(!matches.length) continue;
      for(const at of roles.V) if(Math.abs(at-i)===1) {
        const ast:ExecutableRule={kind:'negation',marker:words[i],position:i<at?'before':'after'};
        if(executableRuleSchema.safeParse(ast).success) add(ast,o,tree.verb.entryId,matches.map(m=>m.id));
      }
    }
  }
  return [...pool.values()];
}
