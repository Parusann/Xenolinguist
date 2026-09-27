import type { MeaningTree } from '../grammar/ast.js';
import { numberQueriesSchema, meaningQueriesSchema, queryKey, stableKey, compareKeys, type GroundedQuery } from './contracts.js';

function unique(queries: GroundedQuery[]): GroundedQuery[] {
  const byKey = new Map<string, GroundedQuery>();
  for (const query of queries) {
    const key = queryKey(query), previous = byKey.get(key);
    if (previous && previous.cost !== query.cost) throw Error('Duplicate query has conflicting costs.');
    byKey.set(key, query);
  }
  return [...byKey.values()].sort((a, b) => compareKeys(queryKey(a), queryKey(b)));
}

/** The available set is supplied by the grounding interface, never by a hidden oracle specification. */
export function numberQueries(raw: unknown): GroundedQuery[] {
  const input = numberQueriesSchema.parse(raw), excluded = new Set([...input.observed, ...input.declined]);
  return unique(input.available).filter(q => q.kind === 'number' && !excluded.has(q.value));
}

/** One supported semantic change at a time; only explicitly answerable meanings survive. */
export function meaningQueries(raw: unknown): GroundedQuery[] {
  const input = meaningQueriesSchema.parse(raw), variants = new Set<string>();
  for (const anchor of input.anchors as MeaningTree[]) {
    variants.add(stableKey(anchor));
    if (input.contrasts.includes('plurality')) {
      if (anchor.kind === 'nominal' && anchor.nominal.head.pos === 'noun')
        variants.add(stableKey({ ...anchor, nominal: { ...anchor.nominal, plural: !anchor.nominal.plural } }));
      if (anchor.kind === 'clause') {
        if (anchor.subject.head.pos === 'noun') variants.add(stableKey({ ...anchor, subject: { ...anchor.subject, plural: !anchor.subject.plural } }));
        if (anchor.object?.head.pos === 'noun') variants.add(stableKey({ ...anchor, object: { ...anchor.object, plural: !anchor.object.plural } }));
      }
    }
    if (anchor.kind !== 'clause') continue;
    if (input.contrasts.includes('tense')) for (const tense of ['present', 'past', 'future']) variants.add(stableKey({ ...anchor, tense }));
    if (input.contrasts.includes('negation')) variants.add(stableKey({ ...anchor, negated: !anchor.negated }));
    if (input.contrasts.includes('roles') && anchor.object) variants.add(stableKey({ ...anchor, subject: anchor.object, object: anchor.subject }));
  }
  const excluded = new Set([...input.observed, ...input.declined].map(stableKey));
  return unique(input.available).filter(q => q.kind === 'meaning' && variants.has(stableKey(q.meaning)) && !excluded.has(stableKey(q.meaning)));
}
