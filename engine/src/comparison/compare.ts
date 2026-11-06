import { ATLAS_LIMITS } from '../../../shared/schemas/atlas.js';
import type { ComparisonEntry, ComparisonInput, ComparisonMatch, ComparisonReport, EvidencePair, ReferenceLanguage } from '../../../shared/schemas/atlas-comparison.js';
import { alignUnits, ComparisonLimitError, orthographicUnits, transcriptionUnits, type ComparisonBudget } from './alignment.js';
import { correspondenceModel, proposeForm, type AlignedEvidence, type CorrespondenceModel } from './correspondences.js';

export const COMPARISON_METHOD = 'bounded-correspondences-1' as const;
const MAX_CONCEPTS = 64, MAX_VARIANTS = 2, MAX_UNITS = 96, MAX_CELLS = 10000000, NULL_SHIFTS = 8;
type PreparedEntry = ComparisonEntry & { orthographic: string[]; phonetic: string[] | null };
type Groups = Map<string, PreparedEntry[]>;
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const meaningKey = (value: string) => value.trim().normalize('NFC').toLowerCase().replace(/^the\s+/u, '');
const conceptKey = (reference: ReferenceLanguage, entry: ReferenceLanguage['entries'][number]) =>
  entry.concepticonId ? 'concepticon:' + entry.concepticonId : reference.sourceId + ':' + entry.conceptId;

function prepare(entry: ComparisonEntry): PreparedEntry | null {
  const orthographic = orthographicUnits(entry.form), phonetic = transcriptionUnits(entry.transcription);
  if (!orthographic.length || orthographic.length > MAX_UNITS) return null;
  return { ...entry, orthographic, phonetic: phonetic && phonetic.length <= MAX_UNITS ? phonetic : null };
}

function add(groups: Groups, concept: string, entry: PreparedEntry) {
  const rows = groups.get(concept) ?? [];
  if (rows.length < MAX_VARIANTS) rows.push(entry);
  groups.set(concept, rows);
}

function bestPair(concept: string, queries: PreparedEntry[], references: PreparedEntry[], budget: ComparisonBudget, preferPhonetics: boolean): EvidencePair {
  const choices: { pair: EvidencePair; score: number }[] = [];
  for (const query of queries) for (const reference of references) {
    const orthographic = alignUnits(reference.orthographic, query.orthographic, budget);
    const phonetic = reference.phonetic && query.phonetic ? alignUnits(reference.phonetic, query.phonetic, budget) : null;
    choices.push({ score: preferPhonetics && phonetic ? phonetic.similarity : orthographic.similarity,
      pair: { concept, meaning: query.meaning ?? concept, queryId: query.id, referenceId: reference.id,
        queryForm: query.form, referenceForm: reference.form, orthographic, phonetic } });
  }
  const phonetic = preferPhonetics ? choices.filter(choice => choice.pair.phonetic) : [];
  const supported = phonetic.length ? phonetic : choices;
  supported.sort((a, b) => b.score - a.score);
  if (!supported.length) throw new Error('An aligned concept has no forms');
  return supported[0].pair;
}

function evidence(pairs: EvidencePair[], phonetic: boolean): AlignedEvidence[] {
  return pairs.flatMap(pair => {
    const alignment = phonetic ? pair.phonetic : pair.orthographic;
    return alignment ? [{ concept: pair.concept, queryId: pair.queryId, referenceId: pair.referenceId, alignment }] : [];
  });
}

function predictedVariants(rows: PreparedEntry[], model: CorrespondenceModel, phonetic: boolean): string[][] | null {
  const result: string[][] = [];
  for (const row of rows) {
    const units = phonetic ? row.phonetic : row.orthographic;
    const prediction = units ? proposeForm(units, model) : null;
    if (!prediction) return null;
    result.push(prediction);
  }
  return result;
}

function compareCandidate(input: ComparisonInput, queries: Groups, reference: ReferenceLanguage, budget: ComparisonBudget): ComparisonMatch {
  const references: Groups = new Map();
  const labels = new Map(reference.entries.map(entry => [conceptKey(reference, entry), entry.meaning ?? entry.conceptId]));
  for (const raw of [...reference.entries].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    const entry = prepare(raw);
    if (entry && raw.meaning) add(references, conceptKey(reference, raw), entry);
  }
  const shared = [...queries.keys()].filter(concept => references.has(concept)).sort().slice(0, MAX_CONCEPTS);
  const usePhonetics = shared.filter(concept => queries.get(concept)!.some(entry => entry.phonetic) &&
    references.get(concept)!.some(entry => entry.phonetic)).length >= 3;
  const pairs = shared.map(concept => ({ ...bestPair(concept, queries.get(concept)!, references.get(concept)!, budget, usePhonetics),
    meaning: labels.get(concept)! }));
  const model = correspondenceModel(evidence(pairs, usePhonetics));
  const controls = [];
  for (let shift = 1; shift <= Math.min(NULL_SHIFTS, shared.length - 1); shift++) {
    const shuffled = shared.map((concept, index) => bestPair(concept, queries.get(concept)!,
      references.get(shared[(index + shift) % shared.length])!, budget, usePhonetics));
    const shuffledModel = correspondenceModel(evidence(shuffled, usePhonetics));
    controls.push({ similarity: mean(shuffled.map(pair => (usePhonetics ? pair.phonetic?.similarity : pair.orthographic.similarity))
      .filter((value): value is number => value !== undefined)), support: shared.length ? shuffledModel.consistentConcepts / shared.length : 0 });
  }
  const features: ComparisonMatch['features'] = [];
  for (const [key, value] of Object.entries(input.features)) {
    const attested = reference.features[key];
    if (value?.status !== 'observed' || !attested) continue;
    const normalized = meaningKey(value.value), allowed = attested.allowedValues?.map(meaningKey);
    features.push({ key, queryValue: value.value, querySource: value.source, referenceValue: attested.value, reference: attested,
      state: allowed && !allowed.includes(normalized) ? 'unmapped' : normalized === meaningKey(attested.value) ? 'agree' : 'different' });
  }
  const comparable = features.filter(feature => feature.state !== 'unmapped');
  let emitted = 0, correct = 0;
  // Each held-out target is removed before learning rules or choosing a reference variant.
  const auditConcepts = shared.filter(concept => !usePhonetics || queries.get(concept)!.some(entry => entry.phonetic));
  for (const concept of auditConcepts) {
    const heldModel = correspondenceModel(evidence(pairs.filter(pair => pair.concept !== concept), usePhonetics));
    const predictions = predictedVariants(references.get(concept)!, heldModel, usePhonetics);
    if (!predictions) continue;
    const unique = new Set(predictions.map(value => JSON.stringify(value)));
    if (unique.size !== 1) continue;
    emitted++;
    const target = [...unique][0];
    if (queries.get(concept)!.some(entry => JSON.stringify(usePhonetics ? entry.phonetic : entry.orthographic) === target)) correct++;
  }
  const precision = emitted ? correct / emitted : null;
  const missing = [...references.keys()].filter(concept => !queries.has(concept)).sort();
  const proposals: ComparisonMatch['proposals'] = [];
  if (model.totalConcepts === pairs.length && emitted >= 5 && precision !== null && precision >= 0.9) {
    for (const concept of missing.slice(0, 10)) {
      const rows = references.get(concept)!;
      const predictions = predictedVariants(rows, model, usePhonetics);
      if (!predictions) continue;
      const forms = predictions.map(prediction => prediction.join(usePhonetics ? ' ' : ''));
      const unique = [...new Set(forms)];
      if (unique.length === 1) proposals.push({ concept, meaning: labels.get(concept)!, forms: unique, referenceIds: rows.map(row => row.id),
        representation: usePhonetics ? 'declared-phonetic-segments' : 'orthographic-graphemes', state: 'proposed',
        assumption: 'position-independent symbol substitution supported by the cited anchors' });
    }
  }
  return { sourceId: reference.sourceId, sourceSha256: reference.sourceSha256, sourceUrl: reference.sourceUrl,
    languageId: reference.id, languageName: reference.name, license: reference.license, attribution: reference.attribution,
    sharedConcepts: shared.length, queryConceptCoverage: queries.size ? shared.length / queries.size : 0,
    orthographicSimilarity: mean(pairs.map(pair => pair.orthographic.similarity)),
    phoneticSimilarity: mean(pairs.flatMap(pair => pair.phonetic ? [pair.phonetic.similarity] : [])),
    correspondenceBasis: usePhonetics ? 'declared-phonetic-segments' : 'orthographic-graphemes',
    systematicSupport: shared.length ? model.consistentConcepts / shared.length : 0,
    correspondenceConcepts: model.totalConcepts, consistentConcepts: model.consistentConcepts,
    fitsSelectedAnchors: model.fitsAllAnchors && model.totalConcepts === pairs.length,
    rules: model.rules, conflicts: model.conflicts,
    control: { shifts: controls.length, meanSimilarity: mean(controls.flatMap(control => control.similarity === null ? [] : [control.similarity])),
      meanSystematicSupport: mean(controls.map(control => control.support)) },
    features, featureAgreement: comparable.length ? comparable.filter(feature => feature.state === 'agree').length / comparable.length : null,
    predictionAudit: { scheduled: auditConcepts.length, emitted, correct, precision }, proposals,
    missingConcepts: missing.slice(0, 10).map(concept => ({ concept, meaning: labels.get(concept)!,
      referenceForm: references.get(concept)![0].form, referenceId: references.get(concept)![0].id })), pairs };
}

/** Deterministic, evidence-only comparisons with bounded alignment work and explicit missingness. */
export function compareLanguages(input: ComparisonInput, references: ReferenceLanguage[]): ComparisonReport {
  const started = performance.now(), budget = { deadline: started + ATLAS_LIMITS.jobMs, usedCells: 0, maxCells: MAX_CELLS };
  const aliases = new Map<string, Set<string>>();
  for (const reference of references) for (const entry of reference.entries) {
    if (!entry.meaning) continue;
    for (const label of [entry.meaning, entry.conceptId, entry.concepticonId, conceptKey(reference, entry)].filter((value): value is string => !!value)) {
      const values = aliases.get(meaningKey(label)) ?? new Set();
      values.add(conceptKey(reference, entry)); aliases.set(meaningKey(label), values);
    }
  }
  const queries: Groups = new Map(), unmapped = new Set<string>();
  let unanchoredEntries = 0, skippedForms = 0;
  for (const row of [...input.entries].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    if (!row.meaning?.trim()) { unanchoredEntries++; continue; }
    const meanings = aliases.get(meaningKey(row.meaning));
    if (!meanings || meanings.size !== 1) { unmapped.add(row.meaning); continue; }
    const entry = prepare(row);
    if (!entry) { skippedForms++; continue; }
    add(queries, [...meanings][0], entry);
  }
  const ordered = [...references].sort((a, b) => {
    const overlap = (reference: ReferenceLanguage) => new Set(reference.entries.filter(entry => queries.has(conceptKey(reference, entry))).map(entry => conceptKey(reference, entry))).size;
    return overlap(b) - overlap(a) || a.id.localeCompare(b.id, 'en') || a.sourceId.localeCompare(b.sourceId, 'en');
  }).slice(0, ATLAS_LIMITS.candidates);
  const matches: ComparisonMatch[] = [];
  let partial = false;
  try {
    for (const reference of ordered) matches.push(compareCandidate(input, queries, reference, budget));
  } catch (error) {
    if (!(error instanceof ComparisonLimitError)) throw error;
    partial = true;
  }
  matches.sort((a, b) => b.systematicSupport * b.queryConceptCoverage - a.systematicSupport * a.queryConceptCoverage || b.sharedConcepts - a.sharedConcepts ||
    (b.phoneticSimilarity ?? b.orthographicSimilarity ?? 0) - (a.phoneticSimilarity ?? a.orthographicSimilarity ?? 0) ||
    a.languageId.localeCompare(b.languageId, 'en'));
  const nextObservations: string[] = [];
  if (queries.size < 3) nextObservations.push('Provide glosses or concept identifiers for at least three distinct words before interpreting reference comparisons.');
  if (unmapped.size) nextObservations.push('Map unmatched meaning labels to documented reference concepts.');
  if (!matches.some(match => match.correspondenceBasis === 'declared-phonetic-segments'))
    nextObservations.push('Add space-separated phonetic transcriptions to evaluate segment correspondences.');
  if (!matches.some(match => match.features.length)) nextObservations.push('Add observed grammatical feature values with their supporting source notes.');
  for (const item of matches[0]?.missingConcepts.slice(0, 3) ?? [])
    nextObservations.push('Collect a contextualized example for ' + item.meaning + ' to test the leading reference hypothesis.');
  if (partial) nextObservations.push('The work limit was reached. Reduce the comparison scope or split long entries before retrying.');
  return { version: 'atlas-comparison-1', method: COMPARISON_METHOD,
    state: partial ? 'partial' : matches.some(match => match.sharedConcepts >= 3) ? 'complete' : 'insufficient',
    input: { versionId: input.versionId, objectSha256: input.objectSha256 },
    referenceSources: [...new Map(references.flatMap(reference => [[reference.sourceId, { id: reference.sourceId, sha256: reference.sourceSha256 }] as const,
      ...Object.values(reference.features).flatMap(feature => feature.sourceSha256 ?
        [[feature.sourceId, { id: feature.sourceId, sha256: feature.sourceSha256 }] as const] : [])])).values()],
    coverage: { entries: input.entries.length, anchoredConcepts: queries.size, unmappedLabels: [...unmapped].sort().slice(0, 20), unanchoredEntries, skippedForms },
    matches, nextObservations, resources: { durationMs: performance.now() - started, alignmentCells: budget.usedCells,
      candidateLimit: ATLAS_LIMITS.candidates, maximumUnits: MAX_UNITS, maximumCells: MAX_CELLS, timeoutMs: ATLAS_LIMITS.jobMs } };
}
