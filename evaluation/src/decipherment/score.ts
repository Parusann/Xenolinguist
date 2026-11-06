import { privateEpisodeSchema, responseSchema, setKey, valueKey, type PrivateEpisode, type Prediction } from './contracts.js';

export type Outcome = { status: 'complete'; response: unknown } |
  { status: 'timeout' | 'error'; message?: string };
export type ItemScore = {
  id: string;
  truthStatus: PrivateEpisode['truth'][number]['status'];
  outcome: 'answer' | 'alternatives' | 'abstain' | 'invalid' | 'missing' | 'timeout' | 'error';
  success: boolean;
  falseClaim: boolean;
  evidenceReferencesValid: boolean | null;
  confidence: number | null;
  brier: number | null;
};

/** References prove citation existence only, never linguistic support. */
export function scoreEpisode(raw: PrivateEpisode, outcome: Outcome): ItemScore[] {
  const episode = privateEpisodeSchema.parse(raw);
  const response = outcome.status === 'complete' ? responseSchema.safeParse(outcome.response) : null;
  const validIds = new Set(episode.learner.challenges.map(c => c.id));
  const predictions = response?.success ? response.data.predictions : [];
  const invalidResponse = outcome.status === 'complete' && (!response?.success ||
    predictions.some(p => !validIds.has(p.id)) || new Set(predictions.map(p => p.id)).size !== predictions.length);
  const evidence = new Set(episode.learner.observations.map(o => o.id));
  return episode.truth.map(truth => {
    const p = predictions.find(p => p.id === truth.id);
    const state = outcome.status !== 'complete' ? outcome.status : invalidResponse ? 'invalid' : !p ? 'missing' : null;
    const item: ItemScore = { id: truth.id, truthStatus: truth.status, outcome: state ?? p!.kind,
      success: false, falseClaim: false, evidenceReferencesValid: null, confidence: null, brier: null };
    if (state || !p) return item;
    if (p.kind === 'abstain') {
      item.success = truth.status === 'ambiguous' ? p.reason === 'ambiguity' :
        truth.status === 'insufficient' && p.reason === 'insufficient-evidence';
      return item;
    }
    item.evidenceReferencesValid = p.evidenceIds.every(id => evidence.has(id));
    const shapeValid = valuesValid(episode, p);
    const allowed = new Set(truth.acceptable.map(valueKey));
    if (p.kind === 'answer') {
      const supportedUnique = truth.status === 'identified' && allowed.has(valueKey(p.value)) && shapeValid;
      item.success = supportedUnique && item.evidenceReferencesValid;
      // Selecting even the hidden generating answer is an unjustified unique claim when evidence is ambiguous.
      item.falseClaim = !supportedUnique || !item.evidenceReferencesValid;
      item.confidence = p.confidence;
      if (truth.status === 'identified') item.brier = (p.confidence - Number(supportedUnique)) ** 2;
    } else {
      item.success = truth.status === 'ambiguous' && setKey(truth.acceptable) === setKey(p.values) &&
        shapeValid && item.evidenceReferencesValid;
      item.falseClaim = truth.status === 'insufficient' || !shapeValid ||
        p.values.some(v => !allowed.has(valueKey(v))) || !item.evidenceReferencesValid;
    }
    return item;
  });
}

function valuesValid(episode: PrivateEpisode, p: Exclude<Prediction, { kind: 'abstain' }>) {
  const values = p.kind === 'answer' ? [p.value] : p.values;
  const learner = episode.learner, challenge = learner.challenges.find(c => c.id === p.id)!;
  return values.every(value => {
    if (learner.task === 'segmentation' && 'surface' in challenge) return value.join('') === challenge.surface;
    if (learner.task === 'lexical') return value.length === 1 && learner.meaningCandidates.includes(value[0]);
    if (learner.task === 'morphology') return value.length === 1;
    return true;
  });
}

export function summarizeItems(items: ItemScore[]) {
  const identified = items.filter(i => i.truthStatus === 'identified');
  const answered = identified.filter(i => i.outcome === 'answer');
  const assertions = items.filter(i => i.outcome === 'answer' || i.outcome === 'alternatives');
  const uncertainty = items.filter(i => i.truthStatus !== 'identified');
  const brier = items.flatMap(i => i.brier === null ? [] : [i.brier]);
  const ratio = (n: number, d: number) => d ? n / d : null;
  return {
    scheduled: items.length, success: items.filter(i => i.success).length,
    identifiedAccuracy: ratio(identified.filter(i => i.success).length, identified.length),
    identifiedAnswerCoverage: ratio(answered.length, identified.length),
    identifiedSelectiveAccuracy: ratio(answered.filter(i => i.success).length, answered.length),
    uncertaintySuccess: ratio(uncertainty.filter(i => i.success).length, uncertainty.length),
    falseClaims: items.filter(i => i.falseClaim).length,
    falseClaimsPerScheduledItem: ratio(items.filter(i => i.falseClaim).length, items.length),
    falseClaimsPerAssertion: ratio(assertions.filter(i => i.falseClaim).length, assertions.length),
    answeredIdentifiedBrier: brier.length ? brier.reduce((a, b) => a + b, 0) / brier.length : null,
    failures: items.filter(i => ['invalid', 'missing', 'timeout', 'error'].includes(i.outcome)).length,
  };
}
