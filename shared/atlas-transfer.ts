import { z } from 'zod';
import type { LanguageProfile, Research } from './types.js';
import { researchSchema } from './schemas/research.js';

const limited = (size: number) => z.string().min(1).max(size);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const proposal = z.object({ concept: limited(128), meaning: limited(512), forms: z.array(limited(512)).min(1).max(2),
  referenceIds: z.array(limited(80)).min(1).max(2), state: z.literal('proposed'),
  representation: z.enum(['orthographic-graphemes', 'declared-phonetic-segments']), assumption: limited(512) });
const reportSchema = z.object({ version: z.literal('atlas-comparison-1'), method: z.literal('bounded-correspondences-1'),
  state: z.enum(['complete', 'partial', 'insufficient']), input: z.object({ versionId: z.uuid(), objectSha256: hash }),
  referenceSources: z.array(z.object({ id: limited(128), sha256: hash })).max(100),
  matches: z.array(z.object({ sourceId: limited(128), sourceSha256: hash, languageId: limited(128), languageName: limited(256),
    sourceUrl: z.url().refine(value => /^https?:/u.test(value)), license: limited(128), attribution: limited(16384),
    predictionAudit: z.object({ scheduled: z.number().int().min(0).max(64), emitted: z.number().int().min(0).max(64),
      correct: z.number().int().min(0).max(64), precision: z.number().min(0).max(1).nullable() }),
    proposals: z.array(proposal).max(10), pairs: z.array(z.object({ concept: limited(128), meaning: limited(512), queryId: limited(80),
      referenceId: limited(80), queryForm: limited(4096), referenceForm: limited(4096) })).max(64),
  })).max(50),
});
export type AtlasTransferReport = z.infer<typeof reportSchema>;
export function parseAtlasReport(raw: string): AtlasTransferReport {
  if (new TextEncoder().encode(raw).byteLength > 4 * 1024 * 1024) throw new Error('The report exceeds the 4 MiB import bound');
  const report = reportSchema.parse(JSON.parse(raw));
  for (const match of report.matches) {
    if (!report.referenceSources.some(source => source.id === match.sourceId && source.sha256 === match.sourceSha256)) throw new Error('The candidate source digest is not pinned in this report');
    if (match.predictionAudit.correct > match.predictionAudit.emitted || match.predictionAudit.emitted > match.predictionAudit.scheduled)
      throw new Error('Invalid prediction audit counts');
  }
  return report;
}
export function selectedEvidence(profile: Pick<LanguageProfile, 'dictionary' | 'samples'>, ids: string[]) {
  const selected = new Set(ids);
  const entries = [...profile.dictionary.filter(entry => selected.has('word:' + entry.id)).map(entry => ({ id: entry.id,
    form: entry.alien_word, ...(entry.english_meaning.trim() ? { meaning: entry.english_meaning } : {}) })),
  ...profile.samples.filter(sample => selected.has('sample:' + sample.id)).map(sample => ({ id: sample.id, form: sample.alien_text,
    annotations: sample.english_translation ? 'Sample translation: ' + sample.english_translation : 'Unglossed sample' }))];
  if (!entries.length || entries.length !== selected.size) throw new Error('Select valid evidence from this profile');
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Selected evidence identifiers overlap');
  return JSON.stringify(entries, null, 2);
}
export async function textDigest(text: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function stageAtlasHypothesis(research: Research, raw: string, sourceId: string, languageId: string, concept: string, form: string): Promise<Research> {
  const report = parseAtlasReport(raw), digest = await textDigest(raw);
  const match = report.matches.find(match => match.sourceId === sourceId && match.languageId === languageId);
  const selected = match?.proposals.find(proposal => proposal.concept === concept && proposal.forms.includes(form));
  if (!match || !selected) throw new Error('The selected proposal is unavailable in this report');
  const key = await textDigest(JSON.stringify([digest, sourceId, languageId, concept, form]));
  if (research.hypotheses.some(hypothesis => hypothesis.id === 'atlas-h-' + key)) return research;
  const capture = JSON.stringify({ kind: 'atlas-proposal-capture-1', reportSha256: digest, method: report.method, input: report.input,
    referenceSources: report.referenceSources, candidate: { id: languageId, name: match.languageName, source: sourceId, url: match.sourceUrl,
      license: match.license, attribution: match.attribution }, proposal: selected, audit: match.predictionAudit, anchors: match.pairs,
    interpretation: 'A conditional proposal imported for review. This report capture does not attest an observed word.' });
  if (capture.length > 8192) throw new Error('The source capture exceeds notebook bounds. Retain the exported report for manual review.');
  const created_at = new Date().toISOString(), observationId = 'atlas-o-' + key, hypothesisId = 'atlas-h-' + key;
  return researchSchema.parse({ ...research, observations: [...research.observations, { id: observationId, created_at, text: capture,
    content_sha256: await textDigest(capture), source: 'Imported Atlas report ' + digest, origin: 'capture', source_id: null, audio: null, derived_from: [] }],
  hypotheses: [...research.hypotheses, { id: hypothesisId, created_at, label: form + ' → ' + selected.meaning + ' (Atlas proposal)',
    provenance: 'user', manual_belief: null, score_definition: 'evidence-counts-1', supersedes: null,
    content: { kind: 'atlas-lexical', form, meaning: selected.meaning, report_sha256: digest, atlas_version: report.input.versionId,
      atlas_source: sourceId, source_sha256: match.sourceSha256, atlas_language: languageId, concept,
      representation: selected.representation, assumption: selected.assumption } }],
  links: [...research.links, { id: 'atlas-l-' + key, created_at, hypothesis_id: hypothesisId, observation_id: observationId,
    annotation_id: null, relation: 'ambiguous', span: null, note: 'Imported conditional proposal. Independent observed evidence is required before accepting its linguistic claim.' }] });
}
