import type { VersionMetadata } from './atlas.js';

export type ComparisonEntry = { id: string; form: string; meaning?: string | null; transcription?: string | null };
export type ReferenceFeature = { value: string; sourceId: string; sourceSha256?: string; sourceUrl: string; citation: string; allowedValues?: string[];
  sourceRecord?: { id: string; references: string; comment: string } };
export type ReferenceLanguage = {
  id: string; name: string; sourceId: string; sourceSha256: string; sourceUrl: string; license: string; attribution: string;
  entries: (ComparisonEntry & { conceptId: string; concepticonId?: string })[];
  features: Record<string, ReferenceFeature>;
};
export type ComparisonInput = {
  versionId: string; objectSha256: string; entries: ComparisonEntry[]; features: VersionMetadata['features'];
};
export type EvidencePair = {
  concept: string; meaning: string; queryId: string; referenceId: string; queryForm: string; referenceForm: string;
  orthographic: { distance: number; similarity: number; unique: boolean; steps: { source: string | null; target: string | null }[] };
  phonetic: { distance: number; similarity: number; unique: boolean; steps: { source: string | null; target: string | null }[] } | null;
};
export type ComparisonMatch = {
  sourceId: string; sourceSha256: string; sourceUrl: string; languageId: string; languageName: string; license: string; attribution: string;
  sharedConcepts: number; queryConceptCoverage: number; orthographicSimilarity: number | null; phoneticSimilarity: number | null;
  correspondenceBasis: 'orthographic-graphemes' | 'declared-phonetic-segments';
  systematicSupport: number; correspondenceConcepts: number; consistentConcepts: number; fitsSelectedAnchors: boolean;
  rules: { source: string; target: string; concepts: string[]; evidence: { queryId: string; referenceId: string }[] }[];
  conflicts: { source: string; targets: string[] }[];
  control: { shifts: number; meanSimilarity: number | null; meanSystematicSupport: number | null };
  features: { key: string; queryValue: string; querySource: string; referenceValue: string; reference: ReferenceFeature;
    state: 'agree' | 'different' | 'unmapped' }[];
  featureAgreement: number | null;
  predictionAudit: { scheduled: number; emitted: number; correct: number; precision: number | null };
  proposals: { concept: string; meaning: string; forms: string[]; referenceIds: string[]; representation: 'orthographic-graphemes' | 'declared-phonetic-segments';
    state: 'proposed'; assumption: string }[];
  missingConcepts: { concept: string; meaning: string; referenceForm: string; referenceId: string }[];
  pairs: EvidencePair[];
};
export type ComparisonReport = {
  version: 'atlas-comparison-1'; method: 'bounded-correspondences-1'; state: 'complete' | 'partial' | 'insufficient';
  input: { versionId: string; objectSha256: string };
  referenceSources: { id: string; sha256: string }[];
  coverage: { entries: number; anchoredConcepts: number; unmappedLabels: string[]; unanchoredEntries: number; skippedForms: number };
  matches: ComparisonMatch[];
  nextObservations: string[];
  resources: { durationMs: number; alignmentCells: number; candidateLimit: number; maximumUnits: number; maximumCells: number; timeoutMs: number };
};
