import { describe, expect, it } from 'vitest';
import { DEMO_LANGUAGE } from '../../../shared/demo-language.js';
import type { DictionaryEntry, ExecutableRule, GrammarRule } from '../../../shared/types.js';
import { executableRuleSchema } from '../../../shared/schemas/grammar.js';
import { derive, type GrammarProfile } from '../translation/derive.js';
import { renderEnglish, pluralize } from '../translation/render.js';
import { generate } from '../morphology/generate.js';
import { LIMITS } from '../grammar/ast.js';

const at = '2026-09-21T00:00:00.000Z';
const rule = (id: string, executable: ExecutableRule): GrammarRule => ({ id, executable, rule: 'Manually asserted fixture', evidence: [], confidence: null, created_at: at });
const word = (id: string, alien_word: string, english_meaning: string, part_of_speech: DictionaryEntry['part_of_speech'], extra: Partial<DictionaryEntry> = {}): DictionaryEntry => ({
  id, alien_word, english_meaning, part_of_speech, confidence: null, context: '', examples: [], notes: '', created_at: at, ...extra,
});
const profile: GrammarProfile = {
  dictionary: [word('speaker', 'ka', 'I', 'pronoun'), word('star', 'nesh', 'star', 'noun'), word('stone', 'kor', 'stone', 'noun'),
    word('large', 'shu', 'large', 'adjective'), word('small', 'nim', 'small', 'adjective'),
    word('see', 'lor', 'to see', 'verb', { verb_frame: 'transitive' }), word('speak', 'mok', 'to speak', 'verb', { verb_frame: 'intransitive' })],
  grammar_rules: [rule('sov', { kind: 'clause-order', order: 'SOV', arguments: 2 }), rule('sv', { kind: 'clause-order', order: 'SOV', arguments: 1 }),
    rule('plural', { kind: 'plural-affix', position: 'suffix', affix: '-en' }), rule('past', { kind: 'tense-affix', position: 'prefix', affix: 'pa-', tense: 'past' }),
    rule('future', { kind: 'tense-affix', position: 'suffix', affix: '-fu', tense: 'future' }), rule('not', { kind: 'negation', marker: 'ix', position: 'before' }),
    rule('adjective', { kind: 'adjective-order', position: 'after' })],
};

function resolved(text: string, data = profile) {
  const result = derive(text, data);
  expect(result.status, result.diagnostics.join('; ')).toBe('resolved');
  expect(result.candidates).toHaveLength(1);
  for (const candidate of result.candidates) {
    for (const step of candidate.steps) expect(text.slice(step.start, step.end)).toBe(step.text);
    for (const id of candidate.ruleIds) expect(data.grammar_rules.some(rule => rule.id === id && rule.executable)).toBe(true);
  }
  return result.candidates[0];
}

describe('executable typed grammar', () => {
  it('licenses an unseen plural stem and refuses to execute notebook prose', () => {
    expect(profile.dictionary.some(entry => entry.alien_word === 'kor-en')).toBe(false);
    const candidate = resolved('kor-en');
    expect(candidate.tree).toMatchObject({ kind: 'nominal', nominal: { head: { entryId: 'stone' }, plural: true } });
    expect(candidate.ruleIds).toEqual(['plural']);
    expect(renderEnglish(candidate.tree)).toEqual({ status: 'rendered', text: 'the stones' });
    expect(derive('kor-en', { ...profile, grammar_rules: profile.grammar_rules.map(r => ({ ...r, executable: null })) }).status).toBe('unresolved');
  });
  it.each([
    ['ka nesh-en shu ix pa-lor.', 'I did not see the large stars'],
    ['ka kor-en lor-fu', 'I will see the stones'],
    ['ka ix mok', 'I do not speak'],
    ['ka mok', 'I do speak'],
    ['nesh ka lor', 'the star does see me'],
    ['nesh-en shu nim', 'the large small stars'],
  ])('derives %s through semantic roles', (source, english) => {
    const candidate = resolved(source);
    expect(renderEnglish(candidate.tree)).toEqual({ status: 'rendered', text: english });
    const generated = generate(candidate.tree, profile);
    expect(generated.status).toBe('resolved');
    for (const item of generated.candidates) {
      expect(resolved(item.text).tree).toEqual(candidate.tree);
      for (const step of item.steps) expect(item.text.slice(step.start, step.end)).toBe(step.text);
    }
  });
  it.each([['SVO', 'ka lor nesh'], ['SOV', 'ka nesh lor'], ['VSO', 'lor ka nesh']] as const)('handles %s without changing semantic roles', (order, text) => {
    const data = { ...profile, grammar_rules: [rule('order', { kind: 'clause-order', order, arguments: 2 })] };
    const candidate = resolved(text, data);
    expect(candidate.tree).toMatchObject({ kind: 'clause', subject: { head: { entryId: 'speaker' } }, object: { head: { entryId: 'star' } }, verb: { entryId: 'see' } });
    expect(generate(candidate.tree, data).candidates[0].text).toBe(text);
  });
  it('requires licensed adjective and negation placement', () => {
    const data = { ...profile, grammar_rules: profile.grammar_rules.map(r => r.id === 'adjective' ? rule(r.id, { kind: 'adjective-order', position: 'before' }) : r.id === 'not' ? rule(r.id, { kind: 'negation', marker: 'ix', position: 'after' }) : r) };
    expect(renderEnglish(resolved('ka shu nesh lor ix', data).tree)).toEqual({ status: 'rendered', text: 'I do not see the large star' });
    expect(derive('ka nesh shu ix lor', data).status).toBe('unresolved');
  });
  it.each(['ka lor', 'ka nesh mok', 'ka nesh lor unknown', 'ka nesh lor. ka mok', 'ka nesh-en-en lor', 'ka nesh, lor', 'ka ka nesh lor'])('leaves unsupported syntax unresolved: %s', text => {
    expect(derive(text, profile)).toMatchObject({ status: 'unresolved', candidates: [] });
  });
  it('requires explicit verb frames and unambiguous lexical meanings', () => {
    const noFrames = { ...profile, dictionary: profile.dictionary.map(entry => ({ ...entry, verb_frame: null })) };
    expect(derive('ka nesh lor', noFrames).status).toBe('unresolved');
    const slash = { ...profile, dictionary: profile.dictionary.map(entry => entry.id === 'star' ? { ...entry, english_meaning: 'star / light' } : entry) };
    expect(derive('ka nesh lor', slash).status).toBe('unresolved');
  });
  it('retains conflicting morphology and lexical parses without claiming a unique result', () => {
    const data = { ...profile, dictionary: [...profile.dictionary, word('whole', 'nesh-en', 'sun', 'noun')] };
    const result = derive('nesh-en', data);
    expect(result.status).toBe('ambiguous');
    expect(result.candidates.map(c => c.tree)).toContainEqual(expect.objectContaining({ kind: 'nominal', nominal: expect.objectContaining({ plural: true }) }));
    expect(result.candidates).toHaveLength(2);
    const conflicting = { ...profile, dictionary: [...profile.dictionary, word('stone-adj', 'kor', 'grey', 'adjective'), word('large-noun', 'shu', 'giant', 'noun')],
      grammar_rules: [...profile.grammar_rules, rule('before', { kind: 'adjective-order', position: 'before' })] };
    expect(derive('kor shu', conflicting).candidates).toHaveLength(2);
  });
  it('preserves original decomposed source spans and affix spans', () => {
    const data = { ...profile, dictionary: [...profile.dictionary, word('accent', 'café', 'cafe', 'noun')] };
    const result = resolved('  cafe\u0301-en!', data);
    expect(result.steps.find(step => step.entryId === 'accent')).toMatchObject({ start: 2, end: 7, text: 'cafe\u0301' });
    expect(result.steps.find(step => step.ruleId === 'plural')).toMatchObject({ start: 7, end: 10, text: '-en' });
  });
  it('uses explicit English plural overrides and does not fabricate irregular verb forms', () => {
    const data = { ...profile, dictionary: [...profile.dictionary, word('ox', 'ox', 'ox', 'noun', { english_plural: 'oxen' })] };
    expect(renderEnglish(resolved('ox-en', data).tree)).toEqual({ status: 'rendered', text: 'the oxen' });
    expect(pluralize('constructor')).toBe('constructors');
  });
  it('reports unsupported copular English instead of producing an invalid auxiliary construction', () => {
    const data = { ...profile, dictionary: [...profile.dictionary, word('be', 'exist', 'be', 'verb', { verb_frame: 'intransitive' })] };
    const candidate = resolved('ka exist', data);
    expect(renderEnglish(candidate.tree)).toMatchObject({ status: 'unsupported' });
  });
  it('reports source, token, candidate, operation and rule limits explicitly', () => {
    expect(derive('a'.repeat(LIMITS.source + 1), profile).status).toBe('limit');
    expect(derive(Array(17).fill('ka').join(' '), profile).status).toBe('limit');
    const many = { ...profile, dictionary: Array.from({ length: 33 }, (_, i) => word(`n${i}`, 'nesh', `noun`, 'noun')) };
    expect(derive('nesh', many)).toMatchObject({ status: 'limit', candidates: [] });
    const expensive = { ...profile, dictionary: Array.from({ length: 2100 }, (_, i) => word(`n${i}`, `word${i}`, 'noun', 'noun')) };
    const result = derive('nesh', expensive);
    expect(result.status).toBe('limit'); expect(result.operations).toBe(LIMITS.operations + 1);
    expect(derive('ka', { ...profile, grammar_rules: Array.from({ length: 65 }, (_, i) => rule(`r${i}`, { kind: 'plural-affix', position: 'suffix', affix: '-en' })) }).status).toBe('invalid-grammar');
  });
  it('rejects malformed rules, unbound generation trees and missing generation rules', () => {
    expect(executableRuleSchema.safeParse({ kind: 'plural-affix', position: 'suffix', affix: '' }).success).toBe(false);
    expect(executableRuleSchema.safeParse({ kind: 'clause-order', order: 'OSV', arguments: 2 }).success).toBe(false);
    const tree = resolved('kor-en').tree;
    expect(generate(tree, { ...profile, grammar_rules: [] })).toMatchObject({ status: 'unresolved', candidates: [] });
    expect(generate(tree, { ...profile, dictionary: [] })).toMatchObject({ status: 'invalid', candidates: [] });
    expect(generate({ ...tree, unexpected: true }, profile).status).toBe('invalid');
  });
  it('executes the manually supplied demo subset and leaves its unsupported examples unresolved', () => {
    expect(renderEnglish(resolved('nesh-en', DEMO_LANGUAGE).tree)).toEqual({ status: 'rendered', text: 'the stars' });
    expect(renderEnglish(resolved('ka nesh lor', DEMO_LANGUAGE).tree)).toEqual({ status: 'rendered', text: 'I do see the star' });
    expect(derive('vel tor krash', DEMO_LANGUAGE).status).toBe('unresolved');
    expect(derive('ka ven zo', DEMO_LANGUAGE).status).toBe('unresolved');
  });
});
