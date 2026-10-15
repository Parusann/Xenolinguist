import { describe, expect, it } from 'vitest';
import { createDefaultProfile, beliefLabel } from '../constants.js';
import { migrateProfile, parseProfile } from '../schemas/profile.js';
import { countMappings, workspaceMetrics, recordMetricSnapshot } from './workspace-metrics.js';
import { rankBases, scoreBase } from './number-evidence.js';

const at = '2026-09-12T10:00:00.000Z';
const profile = () => parseProfile({ ...createDefaultProfile(), id: 'metrics', created_at: at, updated_at: at });
const word = { id: 'word', alien_word: 'Tal', english_meaning: 'Sky', part_of_speech: 'noun' as const,
  confidence: null, context: '', notes: '', examples: [], created_at: at };
describe('workspace evidence metrics', () => {
  it('does not turn duplicate assertions into language progress', () => {
    const p = profile();
    p.dictionary = Array.from({ length: 50 }, (_, i) => ({ ...word, id: `word-${i}`, confidence: 100 }));
    expect(workspaceMetrics(p)).toMatchObject({ assertedEntries: 1, competingForms: 0, observations: 0, ratedEntries: 50 });
    expect(workspaceMetrics(p)).not.toHaveProperty('decoding');
  });
  it('deduplicates normalized content, excludes blanks and separates competing meanings', () => {
    const p = profile();
    p.dictionary = [word, { ...word, id: '2', alien_word: ' ＴＡＬ ', english_meaning: ' sky ' }, { ...word, id: '3', english_meaning: 'heaven' }, { ...word, id: '4', english_meaning: '' }];
    p.samples = [' text ', 'TEXT', ''].map((text, i) => ({ id: `s${i}`, alien_text: text, english_translation: null, decoded: false, audio_id: null, ipa: null, source: '', phonetic_notes: '', created_at: at }));
    p.grammar_rules = [' SOV ', 'sov', ''].map((rule, i) => ({ id: `g${i}`, rule, confidence: null, evidence: [], created_at: at }));
    expect(workspaceMetrics(p)).toMatchObject({ assertedEntries: 2, competingForms: 1, observations: 1, grammarNotes: 1, ratedEntries: 0 });
  });
  it('counts only filled canonical integers in the specified range', () => {
    expect(countMappings({ 0: 'zero', 1: 'one', 20: 'twenty', 21: 'extra', 5: ' ', '01': 'alias', '-1': 'negative', '1.5': 'decimal', '9007199254740993': 'unsafe' }, 1, 20)).toBe(2);
    expect(countMappings({ 1: 'one', 20: 'twenty' }, 1, 10)).toBe(1);
  });
  it('preserves historical manual judgments and permits unrated assertions', () => {
    for (const confidence of [0, 50, 100, null]) {
      const p = migrateProfile({ ...profile(), dictionary: [{ ...word, confidence }] });
      expect(p.dictionary[0]).toMatchObject({ confidence, user_asserted_confidence: confidence });
      expect(migrateProfile(p)).toEqual(p);
    }
    const { confidence: _old, ...unrated } = word;
    expect(parseProfile({ ...profile(), dictionary: [unrated] }).dictionary[0].confidence).toBeNull();
    expect(beliefLabel(100)).toBe('User belief 100/100');
    expect(beliefLabel(null)).toBe('Asserted · unrated');
  });
  it('starts history at the recorded save, preserves snapshots and adds only changed counts', () => {
    const p = profile(); expect(p.metric_snapshots).toBeUndefined();
    const first = recordMetricSnapshot({ ...p, revision: 8 });
    expect(first.metric_snapshots).toHaveLength(1);
    expect(first.metric_snapshots?.[0]).toMatchObject({ revision: 8, recorded_at: at, counts: { assertedEntries: 0 } });
    const next = recordMetricSnapshot({ ...first, dictionary: [word], revision: 9 });
    expect(next.metric_snapshots?.map(s => s.counts.assertedEntries)).toEqual([0, 1]);
    expect(recordMetricSnapshot({ ...next, revision: 10 }).metric_snapshots).toEqual(next.metric_snapshots);
    expect(first.metric_snapshots?.[0].counts.assertedEntries).toBe(0);
  });
  it('bounds saved history without inventing earlier values', () => {
    let p = profile();
    for (let i = 0; i < 1002; i++) p = recordMetricSnapshot({ ...p, revision: i, dictionary: i % 2 ? [word] : [] });
    expect(p.metric_snapshots).toHaveLength(1000);
    expect(p.metric_snapshots?.[0].revision).toBe(2);
    expect(parseProfile(p).metric_snapshots).toEqual(p.metric_snapshots);
  });
});
describe('exploratory number support', () => {
  it('has no suggestion or score without usable evidence', () => {
    expect(rankBases({}).suggestedBase).toBeNull();
    expect(scoreBase({ 6: 'ka ra' }, 5)).toMatchObject({ support: 0, checked: 0, ratio: null, possible: 5 });
  });
  it('requires two distinct supporting compounds and unit references', () => {
    const sparse = { 1: 'ra', 2: 'ru', 5: 'ka', 6: 'ka ra' };
    expect(rankBases(sparse).suggestedBase).toBeNull();
    expect(rankBases({ ...sparse, 7: 'ka ru' }).suggestedBase).toBe(5);
    expect(rankBases({ ...sparse, 7: 'ka ra' }).suggestedBase).toBeNull();
    expect(rankBases({ ...sparse, 2: 'ra', 7: 'ka ra extra' }).suggestedBase).toBeNull();
  });
  it('reports checked coverage and contradictions without calling the ratio confidence', () => {
    expect(scoreBase({ 1: 'ra', 2: 'ru', 5: 'ka', 6: 'ka ra', 7: 'different' }, 5))
      .toEqual({ base: 5, support: 1, checked: 2, possible: 5, ratio: 0.5 });
  });
  it('handles Unicode tokens and shows tied leaders without selecting the first', () => {
    const result = rankBases({ 1: '一', 2: '二', 5: '五', 6: '五 一', 7: '五 二', 10: '十', 11: '十 一', 12: '十 二' });
    expect(result.leaders.map(score => score.base)).toEqual([5, 10]);
    expect(result.suggestedBase).toBeNull();
  });
});
