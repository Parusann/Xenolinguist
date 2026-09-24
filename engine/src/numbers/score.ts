import { NUMBER_VERSION, NUMBER_LIMITS, numberInputSchema, normalizeNumberForm, composeNumber, type NumberInput, type NumberGrammar, type NumberObservation } from './grammar.js';
import { enumerateNumbers } from './enumerate.js';

export type NumberCheck = { value: number; observed: string; predicted?: string; outcome: 'atom' | 'correct' | 'contradiction' | 'unknown' | 'limit' };
export type NumberCandidate = { id: string; grammar: NumberGrammar; fit: NumberCheck[]; validation: NumberCheck[]; support: number; contradictions: number; validationSupport: number; validationContradictions: number; complexityBytes: number };
export type NumberInference = { version: string; status: 'insufficient' | 'exploratory' | 'validated' | 'ambiguous' | 'invalid' | 'limit'; reason: string; caseSensitive: boolean; candidates: NumberCandidate[]; leaderIds: string[]; enumerated: number; fitCount: number; validationCount: number; duplicatesRemoved: number };
const evidenceKey = (c: NumberCandidate) => [c.support, -c.contradictions, c.validationSupport, -c.validationContradictions];
const compare = (a: NumberCandidate, b: NumberCandidate) => {
  const left = evidenceKey(a), right = evidenceKey(b);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return right[i] - left[i];
  return a.complexityBytes - b.complexityBytes || a.id.localeCompare(b.id, 'en');
};
export function inferNumbers(raw: unknown): NumberInference {
  const result: NumberInference = { version: NUMBER_VERSION, status: 'invalid', reason: '', caseSensitive: false, candidates: [], leaderIds: [], enumerated: 0, fitCount: 0, validationCount: 0, duplicatesRemoved: 0 };
  const parsed = numberInputSchema.safeParse(raw);
  if (!parsed.success) return { ...result, reason: 'Use at most 64 fit and 64 validation mappings, integers 0–4095, and forms of 1–128 characters.' };
  const input: NumberInput = { ...parsed.data, fit: [], validation: [] };
  result.caseSensitive = input.caseSensitive;
  const allValues = new Set<number>(), forms = new Map<string, number>();
  for (const partition of ['fit', 'validation'] as const) {
    const seen = new Map<number, string>();
    for (const observation of parsed.data[partition]) {
      const form = normalizeNumberForm(observation.form, input.caseSensitive);
      if (seen.get(observation.value) === form) { result.duplicatesRemoved++; continue; }
      if (seen.has(observation.value) || allValues.has(observation.value))
        return { ...result, reason: 'A value has conflicting forms or occurs in both fit and validation.' };
      if (forms.has(form) && forms.get(form) !== observation.value)
        return { ...result, status: 'ambiguous', reason: 'The same normalized form labels different integers. Resolve or document this ambiguity before induction.' };
      seen.set(observation.value, form); forms.set(form, observation.value); input[partition].push({ value: observation.value, form });
    }
    for (const value of seen.keys()) allValues.add(value);
  }
  input.fit.sort((a, b) => a.value - b.value); input.validation.sort((a, b) => a.value - b.value);
  result.fitCount = input.fit.length; result.validationCount = input.validation.length;
  const enumeration = enumerateNumbers(input);
  if (enumeration.limited) return { ...result, status: 'limit', reason: 'The linker or candidate budget was exceeded; no truncated candidate set is treated as complete.' };
  result.enumerated = enumeration.grammars.length;
  const check = (grammar: NumberGrammar, observation: NumberObservation, fit: boolean): NumberCheck => {
    const prediction = composeNumber(grammar, observation.value);
    const base = { value: observation.value, observed: observation.form };
    if (prediction.status !== 'predicted') return { ...base, outcome: prediction.status === 'limit' ? 'limit' : 'unknown' };
    return { ...base, predicted: prediction.form, outcome: fit && observation.value <= grammar.base ? 'atom' :
      normalizeNumberForm(prediction.form, input.caseSensitive) === observation.form ? 'correct' : 'contradiction' };
  };
  for (const [index, grammar] of enumeration.grammars.entries()) {
    const fit = input.fit.map(o => check(grammar, o, true));
    const support = fit.filter(c => c.outcome === 'correct').length;
    // Distinct normalized surfaces and integer values were checked above. Atoms are never support.
    if (support < 2) continue;
    const validation = input.validation.map(o => check(grammar, o, false));
    result.candidates.push({ id: 'number-' + index, grammar, fit, validation, support,
      contradictions: fit.filter(c => c.outcome === 'contradiction').length,
      validationSupport: validation.filter(c => c.outcome === 'correct').length,
      validationContradictions: validation.filter(c => c.outcome === 'contradiction').length,
      complexityBytes: new TextEncoder().encode(JSON.stringify(grammar)).length });
    if (result.candidates.length > NUMBER_LIMITS.retained) return { ...result, status: 'limit', candidates: [], reason: 'More than 256 supported grammars remain; narrow the observations before prediction.' };
  }
  result.candidates.sort(compare);
  const best = result.candidates[0];
  if (!best) return { ...result, status: 'insufficient', reason: 'Insufficient support: at least two distinct productive fit mappings are required; stored atoms do not count.' };
  // Complexity orders display only: it must not erase grammars indistinguishable on observed evidence.
  const leaders = result.candidates.filter(c => evidenceKey(c).every((n, i) => n === evidenceKey(best)[i]));
  result.leaderIds = leaders.map(c => c.id);
  const completeValidation = input.validation.length > 0 && best.validationSupport === input.validation.length;
  return { ...result, status: leaders.length > 1 ? 'ambiguous' : completeValidation && best.contradictions === 0 ? 'validated' : 'exploratory',
    reason: leaders.length > 1 ? `${leaders.length} grammars remain indistinguishable on the ranked evidence. Complexity is a display preference, not proof.` :
      completeValidation && best.contradictions === 0 ? 'One candidate predicts every supplied validation mapping. Validation was used for selection; this is not a blind test or confirmed linguistic truth.' :
        'Exploratory grammar: examine contradictions, missing predictions and independent validation before relying on it.' };
}
