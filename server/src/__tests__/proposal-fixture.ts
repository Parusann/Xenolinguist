import { createHash } from 'node:crypto';
import { createDefaultProfile } from '../../../shared/constants.js';
import { parseProfile } from '../../../shared/schemas/profile.js';
import type { ResearchProposal } from '../../../shared/schemas/proposals.js';
import type { DictionaryEntry, Sample } from '../../../shared/types.js';

export const at = '2026-09-26T00:00:00.000Z';
export function proposalFixture() {
  const word = (id: string, alien_word: string, english_meaning: string, part_of_speech: DictionaryEntry['part_of_speech']): DictionaryEntry =>
    ({ id, alien_word, english_meaning, part_of_speech, confidence: null, context: '', notes: '', examples: [], created_at: at,
      ...(part_of_speech === 'verb' ? { verb_frame: 'intransitive' as const } : {}) });
  const sample = (id: string, alien_text: string, english_translation: string): Sample => ({ id, alien_text, english_translation, source: 'Synthetic supplied target',
    audio_id: null, ipa: null, decoded: false, phonetic_notes: '', created_at: at });
  const p = parseProfile({ ...createDefaultProfile(), id: 'project', created_at: at, updated_at: at, name: 'Synthetic proposal checks',
    dictionary: [word('speaker', 'ka', 'I', 'pronoun'), word('speak', 'mok', 'to speak', 'verb'), word('star', 'nesh', 'star', 'noun')],
    grammar_rules: [{ id: 'order', rule: 'Subject precedes verb', evidence: ['capture'], confidence: null, created_at: at,
      executable: { kind: 'clause-order', order: 'SVO', arguments: 1 } },
    { id: 'tense', rule: 'pa marks past', evidence: ['capture'], confidence: null, created_at: at,
      executable: { kind: 'tense-affix', position: 'prefix', affix: 'pa-', tense: 'past' } }],
    samples: [sample('past-sample', 'ka pa-mok', 'I did speak'), sample('noun-sample', 'nesh', 'the star')],
  });
  p.research.observations.push({ id: 'capture', created_at: at, text: 'ka pa-mok', content_sha256: createHash('sha256').update('ka pa-mok').digest('hex'),
    source: 'User supplied example', origin: 'capture', source_id: 'past-sample', derived_from: [], audio: null });
  const proposal: ResearchProposal = { scope: { profile_id: p.id, revision: p.revision }, label: 'pa marks future', explanation: 'Test the alternative tense reading.',
    alternatives: ['pa could mark past'], citations: [{ observation_id: 'capture', annotation_id: null, start: 3, end: 9, quote: 'pa-mok', relation: 'supports' }],
    content: { kind: 'grammar', rule_id: 'tense', rule: { kind: 'tense-affix', position: 'prefix', affix: 'pa-', tense: 'future' } } };
  const request = { profile_id: p.id, expectedRevision: p.revision, query: 'pa past tense', model: 'fixture-model', validation_sample_ids: ['past-sample'] };
  return { p: parseProfile(p), proposal, request };
}
