import type { LanguageProfile } from './types';

/**
 * A pre-seeded demo language ("Eridian") for exploring the Xenolinguist workflow
 * without starting from zero. Internally consistent: every word used in the samples
 * and grammar evidence appears in the dictionary, the number system is base-8, and
 * grammar is Subject-Object-Verb. Created via POST /api/profiles/demo.
 *
 * Nested entries carry fixed ids + created_at (unique within the profile); the server
 * assigns the profile id/created_at/updated_at on creation.
 */
const T = '2026-06-07T00:00:00.000Z';

export const DEMO_LANGUAGE: Omit<LanguageProfile, 'id' | 'created_at' | 'updated_at'> = {
  name: 'Eridian',
  description:
    'A partially-decoded demo language for exploring the decoding workflow. Base-8 number system, Subject-Object-Verb word order, and a mix of confirmed and unconfirmed vocabulary.',
  phonetic_notes:
    'Five vowels (a e i o u) and consonants k t n s r v l m + digraphs sh, th. Syllables are (C)V(C); stress falls on the first syllable. A glottal stop marks word boundaries in connected speech.',
  is_sandbox: false,
  number_system: {
    base: 8,
    mappings: {
      1: 'sa',
      2: 'ren',
      3: 'ku',
      4: 'vol',
      5: 'nel',
      6: 'thi',
      7: 'esh',
      8: 'rok', // the base unit ("10" in octal)
      16: 'ren rok', // 2 x 8
      24: 'ku rok', // 3 x 8
    },
    operators: {},
  },
  dictionary: [
    { id: 'word-1', alien_word: 'nesh', english_meaning: 'star / light', part_of_speech: 'noun', confidence: 88, context: 'Recurs in night-sky samples', examples: ['ka nesh lor'], notes: 'Often paired with tor (sky).', created_at: T },
    { id: 'word-2', alien_word: 'tor', english_meaning: 'sky', part_of_speech: 'noun', confidence: 80, context: 'Weather / sky descriptions', examples: ['vel tor krash'], notes: '', created_at: T },
    { id: 'word-3', alien_word: 'vel', english_meaning: 'water', part_of_speech: 'noun', confidence: 85, context: 'Rain and rivers', examples: ['vel tor krash'], notes: '', created_at: T },
    { id: 'word-4', alien_word: 'kor', english_meaning: 'stone', part_of_speech: 'noun', confidence: 78, context: 'Inscriptions on rock', examples: [], notes: '', created_at: T },
    { id: 'word-5', alien_word: 'ral', english_meaning: 'person / being', part_of_speech: 'noun', confidence: 72, context: 'Subject of many utterances', examples: ['ral mok'], notes: 'Plural ral-en attested.', created_at: T },
    { id: 'word-6', alien_word: 'dru', english_meaning: 'dwelling / home', part_of_speech: 'noun', confidence: 55, context: 'Settlement signals', examples: ['dru nim'], notes: 'Meaning probable, not confirmed.', created_at: T },
    { id: 'word-7', alien_word: 'nakto', english_meaning: 'night / darkness', part_of_speech: 'noun', confidence: 60, context: 'Time-of-day markers', examples: [], notes: '', created_at: T },
    { id: 'word-8', alien_word: 'vaela', english_meaning: 'day / sun-cycle', part_of_speech: 'noun', confidence: 58, context: 'Time-of-day markers', examples: [], notes: 'Possibly contrasts with nakto.', created_at: T },
    { id: 'word-9', alien_word: 'mok', english_meaning: 'to speak', part_of_speech: 'verb', confidence: 70, context: 'Communication verbs', examples: ['ral mok', 'ka ix mok'], notes: '', created_at: T },
    { id: 'word-10', alien_word: 'lor', english_meaning: 'to see', part_of_speech: 'verb', confidence: 65, context: 'Perception verbs', examples: ['ka nesh lor'], notes: '', created_at: T },
    { id: 'word-11', alien_word: 'krash', english_meaning: 'to fall / descend', part_of_speech: 'verb', confidence: 75, context: 'Motion verbs', examples: ['vel tor krash'], notes: '', created_at: T },
    { id: 'word-12', alien_word: 'thume', english_meaning: 'to give', part_of_speech: 'verb', confidence: 48, context: 'Exchange contexts', examples: [], notes: 'Low confidence — few examples.', created_at: T },
    { id: 'word-13', alien_word: 'shu', english_meaning: 'great / large', part_of_speech: 'adjective', confidence: 62, context: 'Follows the noun it modifies', examples: ['nesh shu'], notes: '', created_at: T },
    { id: 'word-14', alien_word: 'nim', english_meaning: 'small', part_of_speech: 'adjective', confidence: 52, context: 'Follows the noun it modifies', examples: ['dru nim'], notes: '', created_at: T },
    { id: 'word-15', alien_word: 'ka', english_meaning: 'I / me', part_of_speech: 'pronoun', confidence: 82, context: 'First-person subject', examples: ['ka nesh lor', 'ka ven zo'], notes: '', created_at: T },
    { id: 'word-16', alien_word: 'zo', english_meaning: 'you', part_of_speech: 'pronoun', confidence: 76, context: 'Second-person', examples: ['ka ven zo'], notes: '', created_at: T },
    { id: 'word-17', alien_word: 'ven', english_meaning: 'and / with', part_of_speech: 'connector', confidence: 84, context: 'Joins two nouns', examples: ['ka ven zo'], notes: '', created_at: T },
    { id: 'word-18', alien_word: 'ix', english_meaning: 'not (negation)', part_of_speech: 'particle', confidence: 80, context: 'Precedes the verb', examples: ['ka ix mok'], notes: '', created_at: T },
    { id: 'word-19', alien_word: 'sa', english_meaning: 'one', part_of_speech: 'number', confidence: 95, context: 'Counting sequence', examples: ['sa ren ku vol'], notes: 'Base-8 digit.', created_at: T },
    { id: 'word-20', alien_word: 'ren', english_meaning: 'two', part_of_speech: 'number', confidence: 92, context: 'Counting sequence', examples: ['sa ren ku vol'], notes: 'Base-8 digit.', created_at: T },
  ],
  grammar_rules: [
    { id: 'rule-1', rule: 'Word order is Subject-Object-Verb (SOV).', evidence: ['ka nesh lor = I see the star', 'vel tor krash = water falls from the sky'], confidence: 78, created_at: T },
    { id: 'rule-2', rule: 'Plurals are formed with the suffix -en.', evidence: ['nesh-en = stars', 'ral-en = people'], confidence: 65, created_at: T },
    { id: 'rule-3', rule: "Negation uses the particle 'ix' immediately before the verb.", evidence: ['ka ix mok = I do not speak'], confidence: 70, created_at: T },
    { id: 'rule-4', rule: 'Adjectives follow the noun they modify.', evidence: ['nesh shu = great star', 'dru nim = small dwelling'], confidence: 60, created_at: T },
    { id: 'rule-5', rule: "The connector 'ven' joins two nouns (and / with).", evidence: ['ka ven zo = you and I'], confidence: 82, created_at: T },
  ],
  samples: [
    { id: 'sample-1', alien_text: 'ka nesh lor', english_translation: 'I see the star', source: 'Direct communication', phonetic_notes: '/ka neʃ lor/', decoded: true, audio_id: null, ipa: null, created_at: T },
    { id: 'sample-2', alien_text: 'vel tor krash', english_translation: 'water falls from the sky', source: 'Overheard conversation', phonetic_notes: '/vel tor kraʃ/', decoded: true, audio_id: null, ipa: null, created_at: T },
    { id: 'sample-3', alien_text: 'ka ix mok', english_translation: 'I do not speak', source: 'Direct communication', phonetic_notes: '/ka iks mok/', decoded: true, audio_id: null, ipa: null, created_at: T },
    { id: 'sample-4', alien_text: 'nesh-en shu', english_translation: 'the great stars', source: 'Written inscription', phonetic_notes: '/neʃ.en ʃu/', decoded: true, audio_id: null, ipa: null, created_at: T },
    { id: 'sample-5', alien_text: 'ka ven zo', english_translation: 'you and I', source: 'Direct communication', phonetic_notes: '/ka ven zo/', decoded: true, audio_id: null, ipa: null, created_at: T },
    { id: 'sample-6', alien_text: 'sa ren ku vol', english_translation: 'one two three four', source: 'Radio signal', phonetic_notes: '/sa ren ku vol/', decoded: true, audio_id: null, ipa: null, created_at: T },
    { id: 'sample-7', alien_text: 'thume kor ral nakto', english_translation: null, source: 'Radio signal', phonetic_notes: '/θume kor ral nakto/', decoded: false, audio_id: null, ipa: null, created_at: T },
    { id: 'sample-8', alien_text: 'zo dru lor ix vaela', english_translation: null, source: 'Overheard conversation', phonetic_notes: '/zo dru lor iks vaela/', decoded: false, audio_id: null, ipa: null, created_at: T },
  ],
  audio_clips: [],
};
