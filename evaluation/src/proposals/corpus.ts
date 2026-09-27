import { createHash } from 'node:crypto';
import { createDefaultProfile } from '../../../shared/constants.js';
import { parseProfile } from '../../../shared/schemas/profile.js';
import type { LanguageProfile, DictionaryEntry, ExecutableRule } from '../../../shared/types.js';
import type { ResearchProposal } from '../../../shared/schemas/proposals.js';
import { prng, shuffle } from '../generator/prng.js';

export const VERSION = 'proposal-comparison-1';
export const methods = ['legacy', 'contract', 'pipeline'] as const;
export type Method = typeof methods[number];
export const conditions = ['regular', 'conflicting', 'irregular'] as const;
export type Condition = typeof conditions[number];
export const families = ['lexical', 'tense'] as const;
export const config = { version: VERSION, developmentSeeds: [137], evaluationSeeds: [431, 829], repetitions: 1,
  methods, conditions, families, model: 'gemma4:e4b', modelSeed: 42, temperature: 0.2 } as const;
export const sha = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
const at = '2026-09-27T00:00:00.000Z';
export interface Visible { profile: LanguageProfile; query: string; tests: string[]; family: typeof families[number] }
export interface Case { id: string; seed: number; condition: Condition; visible: Visible;
  oracle: ResearchProposal['content']; challenges: { source: string; expected: string }[];
  evidence: Record<string, 'supports' | 'contradicts' | 'irrelevant'>; focusSpans: Record<string, { start: number; end: number }> }
export function corpusCase(seed: number, family: typeof families[number], condition: Condition): Case {
  const forms = shuffle(['nal', 'ves', 'kir', 'zom', 'pel', 'dun', 'rav', 'sul', 'fen'], prng(seed));
  const [speaker, other, speak, walk, rock, target, marker, plural, irregular] = forms;
  const word = (id: string, alien_word: string, english_meaning: string, part_of_speech: DictionaryEntry['part_of_speech']): DictionaryEntry =>
    ({ id, alien_word, english_meaning, part_of_speech, confidence: null, context: '', notes: '', examples: [], created_at: at,
      ...(part_of_speech === 'verb' ? { verb_frame: 'intransitive' as const } : {}) });
  const rule = (id: string, executable: ExecutableRule) => ({ id, rule: id === 'order' ? 'Supplied subject-verb order' : 'Supplied plural suffix', executable, confidence: null, evidence: [], created_at: at });
  const id = `${family}-${condition}-${seed}`;
  const p = parseProfile({ ...createDefaultProfile(), id: 'profile-' + sha(`${seed}:${family}`).slice(0, 12), name: 'Synthetic proposal task', created_at: at, updated_at: at,
    dictionary: [word('speaker', speaker, 'I', 'pronoun'), word('other', other, 'you', 'pronoun'), word('speak', speak, 'to speak', 'verb'), word('walk', walk, 'to walk', 'verb'), word('rock', rock, 'rock', 'noun')],
    grammar_rules: [rule('order', { kind: 'clause-order', order: 'SVO', arguments: 1 }), rule('plural', { kind: 'plural-affix', position: 'suffix', affix: '-' + plural })],
  });
  const rows = family === 'tense' ? [
    [`${speaker} ${speak}`, 'I speak'], [`${speaker} ${marker}-${speak}`, 'I did speak'], [`${other} ${marker}-${speak}`, 'you did speak'],
  ] : [[rock, 'the rock'], [target, 'the star'], [target, 'the star']];
  const evidence: Case['evidence'] = {};
  const focusSpans: Case['focusSpans'] = {};
  const add = (source: string, expected: string, index: number, relation: Case['evidence'][string]) => {
    const sid = `sample-${index}`, oid = `capture-${index}`;
    p.samples.push({ id: sid, alien_text: source, english_translation: expected, source: 'Synthetic supplied observation', audio_id: null, ipa: null, decoded: false, phonetic_notes: '', created_at: at });
    p.research.observations.push({ id: oid, created_at: at, text: source, content_sha256: sha(source), origin: 'capture', source: 'Synthetic supplied observation', source_id: sid, derived_from: [], audio: null });
    p.research.annotations.push({ id: `annotation-${index}`, created_at: at, observation_id: oid, revision: 1, interpretation: expected, supersedes: null, provenance: 'user' });
    evidence[oid] = relation;
    if (relation !== 'irrelevant') { const focus = family === 'tense' ? marker + '-' + speak : target, start = source.indexOf(focus); focusSpans[oid] = { start, end: start + focus.length }; }
  };
  rows.forEach(([source, expected], index) => add(source, expected, index, index === 0 ? 'irrelevant' : 'supports'));
  add(rock, 'the rock', 3, 'irrelevant');
  if (condition === 'conflicting') add(rows[1][0], family === 'tense' ? 'I will speak' : 'the moon', 4, 'contradicts');
  const oracle: Case['oracle'] = family === 'tense' ? { kind: 'grammar', rule_id: null, rule: { kind: 'tense-affix', affix: marker + '-', position: 'prefix', tense: 'past' } }
    : { kind: 'lexical', entry_id: null, form: target, meaning: 'star', part_of_speech: 'noun', verb_frame: null };
  return { id, seed, condition, visible: { profile: parseProfile(p), family, tests: condition === 'conflicting' ? ['sample-2', 'sample-4'] : ['sample-2'],
    query: family === 'tense' ? `Investigate the ${marker}- marker using captured contrasts. Propose a tense rule or request a distinguishing observation.`
      : `Investigate the meaning of ${target} using captured evidence. Propose a lexical sense or request a distinguishing observation.` }, oracle,
    challenges: family === 'tense' ? [{ source: `${other} ${condition === 'irregular' ? irregular : marker}-${walk}`, expected: 'you did walk' }]
      : [{ source: `${target}-${condition === 'irregular' ? irregular : plural}`, expected: 'the stars' }], evidence, focusSpans };
}
export function corpus(split: 'development' | 'evaluation') {
  return config[split === 'development' ? 'developmentSeeds' : 'evaluationSeeds'].flatMap(seed => families.flatMap(f => conditions.map(c => corpusCase(seed, f, c))));
}
