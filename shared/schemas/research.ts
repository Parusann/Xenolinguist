import { z } from 'zod';
import { entityIdSchema as id, timestampSchema as timestamp } from './common.js';
import { executableRuleSchema } from './grammar.js';
import { numberGrammarSchema } from './numbers.js';

const text = z.string().max(8192);
const base = { id, created_at: timestamp };
export const researchStatusSchema = z.enum(['proposed', 'accepted', 'rejected', 'superseded', 'invalidated']);
export const observationSchema = z.strictObject({ ...base, text: text.min(1), content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  source: text, origin: z.enum(['capture', 'sample', 'model-restatement']), source_id: id.nullable(),
  derived_from: z.array(id).max(64), parent_annotations: z.record(id, id.nullable()).optional(),
  audio: z.strictObject({ clip_id: id, start: z.number().nonnegative(), end: z.number().positive(), asset_sha256: z.string().regex(/^[a-f0-9]{64}$/) }).nullable(),
});
export const annotationSchema = z.strictObject({ ...base, observation_id: id, revision: z.number().int().min(1),
  interpretation: text, supersedes: id.nullable(), provenance: z.enum(['user', 'model']) });
export const hypothesisSchema = z.strictObject({ ...base, label: text.min(1), provenance: z.enum(['user', 'engine', 'model']),
  content: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('lexical'), entry_id: id, form: text, meaning: text }),
    z.strictObject({ kind: z.literal('grammar'), rule_id: id, rule: executableRuleSchema }),
    z.strictObject({ kind: z.literal('number'), grammar: numberGrammarSchema, input_snapshot: z.string().max(2_000_000) }),
  ]),
  manual_belief: z.number().min(0).max(100).nullable(), score_definition: z.literal('evidence-counts-1'),
  supersedes: id.nullable(),
});
export const evidenceLinkSchema = z.strictObject({ ...base, hypothesis_id: id, observation_id: id, annotation_id: id.nullable(),
  relation: z.enum(['supports', 'contradicts', 'ambiguous']),
  span: z.strictObject({ start: z.number().int().nonnegative(), end: z.number().int().positive() }).nullable(), note: text });
export const researchEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('hypothesis-status'), hypothesis_id: id, status: researchStatusSchema, reason: text.min(1) }),
  z.strictObject({ ...base, kind: z.literal('withdraw-observation'), observation_id: id, reason: text.min(1) }),
]);
export const dependencySchema = z.strictObject({ kind: z.enum(['observation', 'hypothesis', 'lexicon', 'grammar', 'policy', 'evidence']),
  id: z.string().max(128), snapshot: z.string().max(2_000_000) });
const lexeme = z.strictObject({ entryId: id, sense: z.number().int().nonnegative().nullable(), lemma: text,
  pos: z.enum(['noun', 'pronoun', 'verb', 'adjective']) });
const nominal = z.strictObject({ head: lexeme, plural: z.boolean(), adjectives: z.array(lexeme).max(2), englishPlural: text.optional() });
const meaningTree = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('nominal'), nominal }),
  z.strictObject({ kind: z.literal('clause'), subject: nominal, verb: lexeme, object: nominal.optional(),
    tense: z.enum(['present', 'past', 'future']), negated: z.boolean() }),
]);
const candidate = z.strictObject({ tree: meaningTree, ruleIds: z.array(id).max(64), steps: z.array(z.strictObject({
  start: z.number().int().nonnegative(), end: z.number().int().nonnegative(), text, operation: text,
  ruleId: id.optional(), entryId: id.optional(), sense: z.number().int().nonnegative().nullable().optional(),
})).max(128) });
export const researchAnalysisSchema = z.strictObject({ ...base, engine_version: z.literal('typed-grammar-1'),
  profile_revision: z.number().int().nonnegative(), source: z.string().max(2048),
  dependencies: z.array(dependencySchema).max(512),
  result: z.strictObject({ status: z.enum(['resolved', 'ambiguous', 'unresolved', 'limit', 'invalid-grammar']),
    candidates: z.array(candidate).max(32), diagnostics: z.array(text).max(128), operations: z.number().int().nonnegative() }),
});
export const researchMetricSchema = z.strictObject({ ...base, definition: z.literal('evidence-counts-1'), profile_revision: z.number().int().nonnegative(),
  hypothesis_id: id, dependencies: z.array(dependencySchema).max(512),
  supports: z.number().int().nonnegative(), contradicts: z.number().int().nonnegative(), ambiguous: z.number().int().nonnegative(),
});
export const researchTestSchema = z.strictObject({ ...base, analysis_id: id, expected: text.min(1),
  outcome: z.enum(['matches', 'differs', 'unresolved']), definition: z.literal('supplied-target-1') });
export const researchSchema = z.strictObject({ observations: z.array(observationSchema).max(2000), annotations: z.array(annotationSchema).max(4000),
  hypotheses: z.array(hypothesisSchema).max(1000), links: z.array(evidenceLinkSchema).max(8000), events: z.array(researchEventSchema).max(4000),
  tests: z.array(researchTestSchema).max(1000),
  analyses: z.array(researchAnalysisSchema).max(100), metrics: z.array(researchMetricSchema).max(1000) });
export const emptyResearch = (): Research => ({ observations: [], annotations: [], hypotheses: [], links: [], events: [], analyses: [], metrics: [], tests: [] });
export type Research = z.infer<typeof researchSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Hypothesis = z.infer<typeof hypothesisSchema>;
export type ResearchAnalysis = z.infer<typeof researchAnalysisSchema>;
export type ResearchDependency = z.infer<typeof dependencySchema>;

/** Audit arrays are append-only, including through the compatibility PUT route. */
export function assertResearchAppendOnly(before: Research, after: Research) {
  for (const key of Object.keys(before) as (keyof Research)[]) {
    if (after[key].length < before[key].length || before[key].some((record, i) => JSON.stringify(record) !== JSON.stringify(after[key][i])))
      throw new Error(`Research ${key} are immutable; append a correction or withdrawal instead`);
  }
}

/** Validate links against retained captures, not mutable notebook samples. */
export function researchIssues(research: Research): string[] {
  const issues: string[] = [], ids = new Set<string>();
  for (const records of Object.values(research)) for (const record of records) {
    if (ids.has(record.id)) issues.push('Duplicate research identifier'); ids.add(record.id);
  }
  const observations = new Map(research.observations.map(o => [o.id, o]));
  const hypotheses = new Map(research.hypotheses.map(h => [h.id, h]));
  const annotations = new Map(research.annotations.map(a => [a.id, a]));
  const seen = new Set<string>();
  for (const o of research.observations) {
    if (o.derived_from.some(id => !seen.has(id)) || (o.origin === 'model-restatement' && !o.derived_from.length)) issues.push('Derived observations require earlier source captures');
    for (const [parent, annotationId] of Object.entries(o.parent_annotations ?? {})) if (!o.derived_from.includes(parent) || (annotationId && annotations.get(annotationId)?.observation_id !== parent)) issues.push('Derived interpretation reference is invalid');
    if (o.audio && o.audio.start >= o.audio.end) issues.push('Invalid captured audio span');
    seen.add(o.id);
  }
  const latest = new Map<string, Research['annotations'][number]>();
  for (const a of research.annotations) {
    const previous = latest.get(a.observation_id);
    if (!observations.has(a.observation_id) || a.revision !== (previous?.revision ?? 0) + 1 || a.supersedes !== (previous?.id ?? null)) issues.push('Annotation revisions must form a consecutive chain');
    latest.set(a.observation_id, a);
  }
  seen.clear();
  for (const h of research.hypotheses) {
    if (h.supersedes && !seen.has(h.supersedes)) issues.push('Hypothesis supersession requires an earlier hypothesis');
    seen.add(h.id);
  }
  for (const link of research.links) {
    const o = observations.get(link.observation_id);
    if (!o || !hypotheses.has(link.hypothesis_id)) issues.push('Evidence link target is missing');
    if (link.annotation_id && annotations.get(link.annotation_id)?.observation_id !== link.observation_id) issues.push('Evidence annotation belongs to another observation');
    if (link.span && (link.span.start >= link.span.end || link.span.end > (o?.text.length ?? 0))) issues.push('Evidence text span is outside its capture');
  }
  const states = new Map<string, string>();
  for (const e of research.events) {
    if (e.kind === 'withdraw-observation') { if (!observations.has(e.observation_id)) issues.push('Withdrawal target is missing'); }
    else {
      if (!hypotheses.has(e.hypothesis_id)) issues.push('Status target is missing');
      const old = states.get(e.hypothesis_id) ?? 'proposed';
      if (['rejected', 'superseded', 'invalidated'].includes(old) && e.status !== old) issues.push('Terminal hypotheses require a new proposal');
      if (e.status === 'superseded' && !research.hypotheses.some(h => h.supersedes === e.hypothesis_id)) issues.push('Superseded hypothesis requires a replacement');
      states.set(e.hypothesis_id, e.status);
    }
  }
  for (const test of research.tests) if (!research.analyses.some(a => a.id === test.analysis_id)) issues.push('Test analysis is missing');
  for (const record of [...research.analyses, ...research.metrics]) {
    if ('hypothesis_id' in record && !hypotheses.has(record.hypothesis_id)) issues.push('Metric hypothesis is missing');
    for (const d of record.dependencies) if ((d.kind === 'observation' && !observations.has(d.id)) || (d.kind === 'hypothesis' && !hypotheses.has(d.id))) issues.push('Analysis dependency is missing');
  }
  return issues;
}
