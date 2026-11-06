import type { Alignment } from './alignment.js';

export type AlignedEvidence = { concept: string; queryId: string; referenceId: string; alignment: Alignment };
export type SymbolRule = { source: string; target: string; concepts: string[]; evidence: { queryId: string; referenceId: string }[] };
export type CorrespondenceModel = {
  rules: SymbolRule[];
  conflicts: { source: string; targets: string[] }[];
  consistentConcepts: number;
  totalConcepts: number;
  support: number;
  fitsAllAnchors: boolean;
};

/** Learn only from uniquely aligned, ungapped evidence and count support by distinct concept. */
export function correspondenceModel(pairs: AlignedEvidence[], minimumConcepts = 3): CorrespondenceModel {
  const mappings = new Map<string, Map<string, Map<string, { queryId: string; referenceId: string; typeKey: string }>>>();
  const clean = pairs.filter(pair => pair.alignment.unique && pair.alignment.steps.every(step => step.source !== null && step.target !== null));
  for (const pair of clean) for (const step of pair.alignment.steps) {
    const targets = mappings.get(step.source!) ?? new Map();
    const concepts = targets.get(step.target!) ?? new Map();
    concepts.set(pair.concept, { queryId: pair.queryId, referenceId: pair.referenceId,
      typeKey: JSON.stringify(pair.alignment.steps.map(step => [step.source, step.target])) });
    targets.set(step.target!, concepts);
    mappings.set(step.source!, targets);
  }
  const rules: SymbolRule[] = [], conflicts: CorrespondenceModel['conflicts'] = [];
  for (const [source, targets] of mappings) {
    if (targets.size > 1) { conflicts.push({ source, targets: [...targets.keys()].sort() }); continue; }
    const [target, concepts] = [...targets][0];
    if (concepts.size >= minimumConcepts && new Set([...concepts.values()].map(value => value.typeKey)).size >= minimumConcepts)
      rules.push({ source, target, concepts: [...concepts.keys()].sort(),
        evidence: [...concepts.values()].map(({ queryId, referenceId }) => ({ queryId, referenceId })) });
  }
  rules.sort((a, b) => b.concepts.length - a.concepts.length || a.source.localeCompare(b.source, 'en'));
  conflicts.sort((a, b) => a.source.localeCompare(b.source, 'en'));
  const supported = new Map(rules.map(rule => [rule.source, rule.target]));
  const concepts = new Set(pairs.map(pair => pair.concept));
  const consistentConcepts = new Set(clean.filter(pair => pair.alignment.steps.every(step => supported.get(step.source!) === step.target)).map(pair => pair.concept)).size;
  return { rules, conflicts, consistentConcepts, totalConcepts: concepts.size,
    support: concepts.size ? consistentConcepts / concepts.size : 0,
    fitsAllAnchors: clean.length === pairs.length && !conflicts.length };
}

/** Conditional proposal under a position-independent symbol substitution model. */
export function proposeForm(source: string[], model: CorrespondenceModel): string[] | null {
  if (!model.fitsAllAnchors || !source.length) return null;
  const mapping = new Map(model.rules.map(rule => [rule.source, rule.target]));
  if (source.some(unit => !mapping.has(unit))) return null;
  return source.map(unit => mapping.get(unit)!);
}
