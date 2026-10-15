import { z } from 'zod';
import type { LanguageProfile } from '../../../shared/types.js';
import { grammarSetupSchema, type GrammarSetup } from '../../../shared/schemas/grammar-elicitation.js';
import { meaningTreeSchema } from '../morphology/generate.js';
import { grammarElicitationSchema, stableKey } from './contracts.js';
import { predictGrammarOutcomes } from './predict-outcomes.js';
import { selectGrammarQuery } from './select.js';
import { normalizeNumberForm } from '../numbers/grammar.js';

export const grammarContextSchema = grammarElicitationSchema.omit({ questions: true });
export const grammarEvidenceSchema = z.strictObject({ meaning: meaningTreeSchema, answer: z.string().min(1).max(128), observation_id: z.string().min(1).max(128) });
export const grammarSourceSchema = z.strictObject({ profile_id: z.string(), profile_revision: z.number().int().nonnegative(), setup: grammarSetupSchema,
  context: grammarContextSchema, evidence: z.array(grammarEvidenceSchema).max(20), declined: z.array(meaningTreeSchema).max(20) });
export type GrammarSource = z.infer<typeof grammarSourceSchema>;

/** Compare explicitly chosen alternative rule sets; unrelated prose and private notes are not inputs. */
export function grammarContext(profile: LanguageProfile, setup: GrammarSetup) {
  return grammarContextSchema.parse({ dictionary: profile.dictionary.map(e => ({ ...e, context: '', notes: '', examples: [], confidence: null, user_asserted_confidence: undefined, created_at: '1970-01-01T00:00:00.000Z' })),
    lexical_policy: profile.lexical_policy,
    candidates: setup.candidates.map(c => ({ id: c.id, rules: c.rule_ids.map(id => {
      const rule = profile.grammar_rules.find(r => r.id === id)?.executable;
      if (!rule) throw Error('A selected executable rule is missing. Review the alternative rule sets.');
      return rule;
    }) })) });
}
export function grammarSessionReport(source: GrammarSource) {
  const { context, setup, evidence, declined } = source;
  const outcomes = evidence.map(e => predictGrammarOutcomes({ ...context, questions: { anchors: [e.meaning], available: [{ kind: 'meaning', meaning: e.meaning, cost: 1 }] } }));
  const identities = predictGrammarOutcomes({ ...context, questions: { anchors: [], available: [] } }).candidates;
  const scores = identities.map(c => {
    let matches = 0, contradictions = 0, unavailable = 0;
    for (let i = 0; i < evidence.length; i++) {
      const prediction = outcomes[i].rows[0].predictions.find(p => p.candidateId === c.id)!;
      if (prediction.status === 'unavailable') unavailable++;
      else if (prediction.form === normalizeNumberForm(evidence[i].answer, context.lexical_policy?.caseSensitive ?? false)) matches++;
      else contradictions++;
    }
    return { ...c, matches, contradictions, unavailable };
  });
  const remaining = scores.filter(c => !c.contradictions).map(c => c.id);
  const plan = selectGrammarQuery({ ...context, candidates: context.candidates.filter(c => remaining.includes(c.id)),
    questions: { anchors: setup.anchors, available: setup.available, observed: evidence.map(e => e.meaning), declined } });
  return { version: 'grammar-elicitation-session-1', status: plan.status, reason: plan.reason, scores, remaining, evidenceCount: evidence.length,
    considered: plan.ranked.length, eligible: plan.ranked.filter(q => q.eligible).length, unavailable: plan.ranked.filter(q => q.unavailable).length,
    selection: plan.selected ? { meaning: plan.selected.query.kind === 'meaning' ? plan.selected.query.meaning : null, cost: plan.selected.query.cost,
      disagreementBits: plan.selected.disagreementBits, expectedRemaining: plan.selected.expectedRemaining, groups: plan.selected.groups } : null };
}
export type GrammarSessionReport = ReturnType<typeof grammarSessionReport>;
export const grammarContextKey = (p: LanguageProfile, s: GrammarSetup) => stableKey(grammarContext(p, s));
