import { composeNumber } from '../numbers/grammar.js';
import { generate } from '../morphology/generate.js';
import type { MeaningTree } from '../grammar/ast.js';
import { normalizeNumberForm } from '../numbers/grammar.js';
import { numberElicitationSchema, grammarElicitationSchema, stableKey, compareKeys, type CandidateIdentity, type Prediction, type QueryOutcomes } from './contracts.js';
import { numberQueries, meaningQueries } from './queries.js';

function distinct<T extends { id: string }>(candidates: T[], signature: (candidate: T) => string) {
  if (new Set(candidates.map(c => c.id)).size !== candidates.length) throw Error('Candidate IDs must be unique.');
  const groups = new Map<string, T[]>();
  for (const candidate of candidates) { const key = signature(candidate); groups.set(key, [...(groups.get(key) ?? []), candidate]); }
  return [...groups.values()].map(group => {
    group.sort((a, b) => compareKeys(a.id, b.id));
    return { candidate: group[0], identity: { id: group[0].id, aliases: group.slice(1).map(c => c.id) } };
  }).sort((a, b) => compareKeys(a.identity.id, b.identity.id));
}
export type OutcomeMatrix = { candidates: CandidateIdentity[]; rows: QueryOutcomes[]; caseSensitive: boolean };

export function predictNumberOutcomes(raw: unknown): OutcomeMatrix {
  const input = numberElicitationSchema.parse(raw);
  const candidates = distinct(input.candidates, c => stableKey(c.grammar));
  const rows = numberQueries(input.questions).map(query => ({ query, predictions: candidates.map(({ candidate }): Prediction => {
    if (query.kind !== 'number') throw Error('Number query required.');
    const result = composeNumber(candidate.grammar, query.value);
    return result.status === 'predicted' ? { candidateId: candidate.id, status: 'predicted', form: result.form } :
      { candidateId: candidate.id, status: 'unavailable', reason: `${result.status}: ${result.reason}` };
  }) }));
  return { candidates: candidates.map(c => c.identity), rows, caseSensitive: input.caseSensitive };
}

export function predictGrammarOutcomes(raw: unknown): OutcomeMatrix {
  const input = grammarElicitationSchema.parse(raw);
  if (new Set(input.dictionary.map(w => w.id)).size !== input.dictionary.length) throw Error('Dictionary IDs must be unique.');
  const candidates = distinct(input.candidates, c => stableKey([...new Set(c.rules.map(stableKey))].sort()));
  const caseSensitive = input.lexical_policy?.caseSensitive ?? false;
  const rows = meaningQueries(input.questions).map(query => ({ query, predictions: candidates.map(({ candidate }): Prediction => {
    if (query.kind !== 'meaning') throw Error('Meaning query required.');
    const rules = [...new Map(candidate.rules.map(ast => [stableKey(ast), ast])).values()];
    const result = generate(query.meaning as MeaningTree, { dictionary: input.dictionary, lexical_policy: input.lexical_policy,
      grammar_rules: rules.map((executable, i) => ({ id: 'elicitation-rule-' + i, executable, rule: '', evidence: [], confidence: null, created_at: '1970-01-01T00:00:00.000Z' })) });
    const forms = [...new Set(result.candidates.map(c => normalizeNumberForm(c.text, caseSensitive)))];
    return forms.length === 1 && ['resolved', 'ambiguous'].includes(result.status)
      ? { candidateId: candidate.id, status: 'predicted', form: forms[0] }
      : { candidateId: candidate.id, status: 'unavailable', reason: `${result.status}: ${result.diagnostics.join('; ') || 'Multiple distinct predicted forms.'}` };
  }) }));
  return { candidates: candidates.map(c => c.identity), rows, caseSensitive };
}
