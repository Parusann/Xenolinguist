import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDefaultProfile } from '../../../shared/constants.js';
import { parseProfile } from '../../../shared/schemas/profile.js';
import { selectedEvidence, stageAtlasHypothesis, parseAtlasReport } from '../../../shared/atlas-transfer.js';
import { compareLanguages } from '../comparison/compare.js';
import { syntheticComparison } from '../../../evaluation/src/atlas/fixtures.js';
import { hypothesisState } from '../evidence/graph.js';
import { evidenceCounts } from '../evidence/scores.js';

it('exports only explicitly selected evidence, omitting recordings and unrelated profile fields', () => {
  const data = { dictionary: [{ id: 'w', alien_word: 'ka', english_meaning: 'water', notes: 'private note' }],
    samples: [{ id: 's', alien_text: 'longer sample', english_translation: 'a contextual phrase', audio_id: 'private-recording' }] };
  const exported = JSON.parse(selectedEvidence(data as never, ['word:w']));
  expect(exported).toEqual([{ id: 'w', form: 'ka', meaning: 'water' }]);
  expect(() => selectedEvidence(data as never, ['word:missing'])).toThrow();
  expect(JSON.parse(selectedEvidence(data as never, ['sample:s']))[0]).not.toHaveProperty('meaning');
});
it('stages a source-pinned proposal without turning the report into observed support', async () => {
  const { input, reference } = syntheticComparison(17); input.versionId = randomUUID();
  const raw = JSON.stringify(compareLanguages(input, [reference])), report = parseAtlasReport(raw), proposal = report.matches[0].proposals[0];
  const profile = parseProfile({ ...createDefaultProfile(), id: 'profile', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const research = await stageAtlasHypothesis(profile.research, raw, reference.sourceId, reference.id, proposal.concept, proposal.forms[0]);
  expect(research.hypotheses).toHaveLength(1); expect(research.hypotheses[0].content.kind).toBe('atlas-lexical');
  profile.research = research;
  expect(hypothesisState(parseProfile(profile), research.hypotheses[0]).state).toBe('proposed');
  expect(evidenceCounts(profile, research.hypotheses[0].id).supports).toBe(0);
  expect(await stageAtlasHypothesis(research, raw, reference.sourceId, reference.id, proposal.concept, proposal.forms[0])).toBe(research);
  expect(profile.dictionary).toHaveLength(0);
  await expect(stageAtlasHypothesis(research, raw, reference.sourceId, reference.id, proposal.concept, 'forged')).rejects.toThrow();
  const tampered = JSON.parse(raw); tampered.referenceSources[0].sha256 = 'a'.repeat(64);
  expect(() => parseAtlasReport(JSON.stringify(tampered))).toThrow('digest');
});
