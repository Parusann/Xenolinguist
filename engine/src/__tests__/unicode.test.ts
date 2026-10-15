import { describe, it, expect } from 'vitest';
import { LexiconIndex, profileLexicon, renderToken } from '../lexicon/index.js';
import { normalize, DEFAULT_LEXICAL_POLICY } from '../text/normalize.js';
import { tokenize } from '../text/tokenize.js';
import type { DictionaryEntry } from '../../../shared/types.js';

const entry = (alien_word: string, english_meaning = 'meaning', id = alien_word): DictionaryEntry => ({
  id, alien_word, english_meaning, part_of_speech: 'noun', confidence: null,
  context: '', examples: [], notes: '', created_at: '2026-09-21T00:00:00.000Z',
});
const policy = DEFAULT_LEXICAL_POLICY;
const output = (index: LexiconIndex, input: string, direction: 'forward' | 'reverse' = 'forward') => index.analyze(input, direction).map(token => renderToken(token, direction)).join('');

describe('Unicode lexical processing', () => {
  it.each(['水', 'தமிழ்', 'вода', 't͡ʃaː', 'café', '𐐀', '가', 'l’eau', "can't", 'red-blue', '१२'])('finds %s with attached punctuation and exact original spans', form => {
    const source = `🙂  ${form.normalize('NFD')}!\n`;
    const index = new LexiconIndex([entry(form)]);
    const tokens = index.analyze(source);
    expect(tokens.map(token => token.text).join('')).toBe(source);
    for (const token of tokens) expect(source.slice(token.start, token.end)).toBe(token.text);
    const found = tokens.find(token => token.candidates.length)!;
    expect(found.candidates[0].entry.alien_word).toBe(form);
    expect(found.start).toBe(4);
    expect(found.end).toBe(4 + form.normalize('NFD').length);
    expect(output(index, source)).toBe('🙂  meaning!\n');
    expect(index.search(form.normalize('NFD'))).toHaveLength(1);
  });

  it('preserves unknown scripts as words, punctuation and every source character', () => {
    const source = ' 水 தமிழ்\tвода?!🙂';
    expect(output(new LexiconIndex([]), source)).toBe(' [水] [தமிழ்]\t[вода]?!🙂');
  });

  it('makes case and internal apostrophe/hyphen boundaries explicit', () => {
    const dictionary = [entry('Tal', 'upper', 'u'), entry('tal', 'lower', 'l')];
    expect(new LexiconIndex(dictionary).lookup('TAL')).toHaveLength(2);
    const sensitive = new LexiconIndex(dictionary, { ...policy, caseSensitive: true });
    expect(sensitive.lookup('Tal').map(s => s.meaning)).toEqual(['upper']);
    expect(sensitive.lookup('TAL')).toEqual([]);
    expect(sensitive.search('TAL')).toEqual([]);
    expect(tokenize("'a-b c’d'", policy).map(t => t.text)).toEqual(["'", 'a-b', ' ', 'c’d', "'"]);
    expect(tokenize('a-b c’d', { ...policy, hyphens: 'boundary', apostrophes: 'boundary' }).filter(t => t.kind === 'word').map(t => t.text)).toEqual(['a', 'b', 'c', 'd']);
    expect(normalize('İ')).toBe('i\u0307'); // Unicode lowercase, not locale-sensitive or accent removal.
  });

  it('retains all homographs and explicit senses without first-record selection', () => {
    const first = { ...entry('tal', 'bank / shore', 'a'), form_aliases: ['tál', 'ta\u0301l'],
      senses: [{ meaning: 'river bank', aliases: ['shore'] }, { meaning: 'financial bank', aliases: ['bank'] }] };
    const index = new LexiconIndex([first, entry('tal', 'sky', 'b')]);
    expect(index.lookup('tál')).toHaveLength(2);
    expect(index.analyze('tal')[0].candidates.map(c => c.meaning)).toEqual(['river bank', 'financial bank', 'sky']);
    expect(output(index, 'tal')).toBe('⟦river bank | financial bank | sky⟧');
    expect(output(index, 'shore', 'reverse')).toBe('tal');
    expect(index.search('financial')).toEqual([first]);
  });

  it('matches whole reverse phrases and only explicitly accepted aliases', () => {
    const index = new LexiconIndex([entry('x', 'to speak'), entry('y', 'star / light')]);
    expect(output(index, 'to speak, to! star / light; star light', 'reverse')).toBe('x, [to]! y; [star] [light]');
    expect(output(index, 'to\n  speak', 'reverse')).toBe('x');
    const explicit = new LexiconIndex([{ ...entry('x', 'to speak'), senses: [{ meaning: 'speak', aliases: ['to speak'] }] }]);
    expect(output(explicit, 'speak to speak to', 'reverse')).toBe('x ⟦x | speak → x⟧ [to]');
  });

  it('never hides competing segmentations or invents a segmentation for unknown scripts', () => {
    const dictionary = [entry('水', 'water'), entry('火', 'fire'), entry('水火', 'steam')];
    expect(output(new LexiconIndex(dictionary.slice(0, 2)), '水火')).toBe('[水火]');
    const index = new LexiconIndex(dictionary, { ...policy, segmentation: 'dictionary' });
    expect(index.analyze('水火')[0].candidates.map(c => [c.text, c.start, c.end])).toEqual([['水', 0, 1], ['水火', 0, 2], ['火', 1, 2]]);
    expect(output(index, '水火')).toBe('⟦水 → water | steam | 火 → fire⟧');
    expect(output(new LexiconIndex(dictionary.slice(0, 2), { ...policy, segmentation: 'dictionary' }), '水火')).toBe('waterfire');
    expect(output(index, '水未知')).toBe('water[未知]');
  });

  it('keeps overlapping phrase candidates and unknown gaps in source order', () => {
    const index = new LexiconIndex([entry('a b', 'ab'), entry('b c', 'bc'), entry('a', 'a')]);
    const tokens = index.analyze('!a b c? d');
    expect(tokens.map(t => t.text).join('')).toBe('!a b c? d');
    expect(tokens[1].candidates.map(c => c.meaning)).toEqual(['a', 'ab', 'bc']);
    expect(tokens[1].text).toBe('a b c');
  });

  it('invalidates indexes on revisions, optimistic dictionary edits and policy changes', () => {
    const profile = { id: 'profile', revision: 0, dictionary: [entry('Tal')] };
    const initial = profileLexicon(profile);
    expect(profileLexicon({ ...profile })).toBe(initial);
    expect(profileLexicon({ ...profile, revision: 1 })).not.toBe(initial);
    const edited = profileLexicon({ ...profile, dictionary: [entry('new')] });
    expect(edited.lookup('Tal')).toEqual([]);
    expect(profileLexicon({ ...profile, lexical_policy: { ...policy, caseSensitive: true } }).lookup('tal')).toEqual([]);
  });
});
