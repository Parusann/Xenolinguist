import { describe, expect, it } from 'vitest';
import { matchAccepted, matchInteger } from './grading.js';
import { createSandboxSession, applySandboxAction, challengeProgress, sandboxStats, type SandboxAction } from './session.js';
import { conlangSchema, sandboxSessionSchema } from '../schemas/sandbox.js';
import { createDefaultProfile } from '../constants.js';
import { parseProfile } from '../schemas/profile.js';
import type { LanguageProfile } from '../types.js';
const now = '2026-09-12T00:00:00.000Z';
const data = { language_name: 'Test', phoneme_set: ['a'], number_base: 10, word_order: 'SVO', rules: ['Subjects precede verbs'],
  number_words: { '1': 'ka', '2': 'ki', '3': 'ku' }, vocabulary: [{ alien: 'tal', english: 'sky', pos: 'noun', accepted_forms: ['heavens'] }, { alien: 'nek', english: 'cat', pos: 'noun' }],
  sample_sentences: [{ alien: 'tal nek.', english: 'The sky cat.', accepted_forms: ['The cat of the sky.'] }] };
const profile = (): LanguageProfile => parseProfile({ ...createDefaultProfile(), id: 'owner', created_at: now, updated_at: now, is_sandbox: true,
  sandbox_session: createSandboxSession(data, 'session', now, 'test-model') });
function drive(initial: LanguageProfile, actions: SandboxAction[]) { return actions.reduce((p, a, i) => applySandboxAction(p, 'session', a, `event-${p.sandbox_session!.events.length}-${i}`, now), initial); }

describe('exact practice grading', () => {
  it.each(['s', '', '   ', 'sk', 'skyscraper'])('does not award sky for %j', answer => expect(matchAccepted(answer, ['sky'])).toBe(false));
  it('rejects substrings and accepts only declared normalized forms', () => {
    expect(matchAccepted('caterpillar', ['cat'])).toBe(false);
    expect(matchAccepted('cat', ['caterpillar'])).toBe(false);
    expect(matchAccepted('  “ＳＫＹ!” ', ['sky'])).toBe(true);
    expect(matchAccepted('cafe\u0301', ['café'])).toBe(true);
    expect(matchAccepted('heavens', ['sky'])).toBe(false);
    expect(matchAccepted('heavens', ['sky', 'heavens'])).toBe(true);
    expect(matchAccepted('sky', ['the sky cat'])).toBe(false);
  });
  it.each(['1cat', '1.0', '1e0', '1 0', '0x1', 'NaN', 'Infinity', '', '9007199254740993'])('rejects incomplete/unsafe integer %j', answer => expect(matchInteger(answer, '1')).toBe(false));
  it('parses whole safe integer forms', () => { for (const answer of ['1', '+01', ' １ ']) expect(matchInteger(answer, '1')).toBe(true); expect(matchInteger('-1', '1')).toBe(false); });
});

describe('persistent practice transitions', () => {
  it('allows correcting a sign error and treats numeric tokens as complete integers', () => {
    const p = drive(profile(), [{ type: 'guess', challengeId: 'number-0', value: '-1' }, { type: 'check', challengeId: 'number-0' },
      { type: 'guess', challengeId: 'number-0', value: '1' }, { type: 'check', challengeId: 'number-0' }]);
    expect(challengeProgress(p.sandbox_session!, 'number-0')).toMatchObject({ matched: true });
    expect(p.sandbox_session!.events).toHaveLength(2);
    const session = createSandboxSession({ ...data, sample_sentences: [{ alien: 'ka', english: 'one' }] }, 'session', now, 'fixture');
    const token = drive({ ...profile(), sandbox_session: session }, [{ type: 'guess', challengeId: 'token-0-0', value: '-1' }, { type: 'check', challengeId: 'token-0-0' }]);
    expect(challengeProgress(token.sandbox_session!, 'token-0-0').matched).toBe(false);
    expect(sandboxSessionSchema.safeParse(token.sandbox_session).success).toBe(true);
  });
  it('keeps wrong attempts, retries and terminal submissions idempotent', () => {
    let p = drive(profile(), [{ type: 'guess', challengeId: 'vocabulary-0', value: 's' }, { type: 'check', challengeId: 'vocabulary-0' }, { type: 'check', challengeId: 'vocabulary-0' }]);
    expect(p.sandbox_session!.events).toHaveLength(1); expect(p.dictionary).toHaveLength(0);
    p = drive(p, [{ type: 'guess', challengeId: 'vocabulary-0', value: 'heavens' }, { type: 'check', challengeId: 'vocabulary-0' }, { type: 'check', challengeId: 'vocabulary-0' }, { type: 'reveal', challengeId: 'vocabulary-0' }]);
    expect(p.dictionary).toHaveLength(1); expect(p.sandbox_session!.events).toHaveLength(2);
    expect(sandboxStats(p.sandbox_session!)).toMatchObject({ attempted: 1, unaidedFirst: 0, retries: 1, revealed: 0 });
    expect(sandboxSessionSchema.parse(p.sandbox_session)).toEqual(p.sandbox_session);
  });
  it('separates hints, reveals and first-attempt credit and preserves IDs through serialization', () => {
    const p = drive(profile(), [{ type: 'hint', challengeId: 'number-0' }, { type: 'guess', challengeId: 'number-0', value: '1' }, { type: 'check', challengeId: 'number-0' },
      { type: 'reveal', challengeId: 'number-1' }, { type: 'guess', challengeId: 'number-2', value: '3' }, { type: 'check', challengeId: 'number-2' }]);
    const recovered = parseProfile(JSON.parse(JSON.stringify(p)));
    expect(recovered.dictionary).toHaveLength(3); expect(recovered.sandbox_session?.challenges).toEqual(p.sandbox_session?.challenges);
    expect(sandboxStats(recovered.sandbox_session!)).toMatchObject({ attempted: 2, unaidedFirst: 1, hints: 1, revealed: 1 });
    expect(recovered.number_system.mappings).toEqual({ 1: 'ka', 2: 'ki', 3: 'ku' });
    expect(applySandboxAction(recovered, 'old-session', { type: 'reveal', challengeId: 'vocabulary-0' }, 'ignored', now)).toBe(recovered);
  });
  it('uses conservative sentence matching and keeps token help out of unaided scores', () => {
    const p = drive(profile(), [{ type: 'word-mode', challengeId: 'sentence-0' }, { type: 'guess', challengeId: 'token-0-0', value: 's' }, { type: 'check', challengeId: 'token-0-0' },
      { type: 'guess', challengeId: 'sentence-0', value: 'The cat of the sky!' }, { type: 'check', challengeId: 'sentence-0' }]);
    expect(challengeProgress(p.sandbox_session!, 'token-0-0').matched).toBe(false);
    expect(sandboxStats(p.sandbox_session!)).toMatchObject({ attempted: 1, unaidedFirst: 0, hints: 1 }); expect(p.samples).toHaveLength(1);
  });
  it('does not duplicate a grammar reveal or an existing workspace word', () => {
    let p = drive(profile(), [{ type: 'reveal', challengeId: 'grammar-0' }, { type: 'reveal', challengeId: 'grammar-0' }, { type: 'reveal', challengeId: 'vocabulary-0' }]);
    p = { ...p, sandbox_session: createSandboxSession(data, 'new-session', now, 'test-model') };
    p = applySandboxAction(p, 'new-session', { type: 'reveal', challengeId: 'vocabulary-0' }, 'again', now);
    expect(p.dictionary).toHaveLength(1); expect(p.grammar_rules).toHaveLength(1);
  });
  it('rejects malformed generations and inconsistent event/key references', () => {
    for (const invalid of [{ ...data, rules: [] }, { ...data, vocabulary: [] }, { ...data, language_name: ' ' }, { ...data, number_base: 1 },
      { ...data, number_words: { 1: 'same', 2: 'same', 3: 'same' } }, { ...data, sample_sentences: [{ alien: 'missing', english: 'missing' }] }]) expect(conlangSchema.safeParse(invalid).success).toBe(false);
    const s = profile().sandbox_session!; s.challenges[0].accepted = ['10']; expect(sandboxSessionSchema.safeParse(s).success).toBe(false);
    const forged = profile().sandbox_session!;
    forged.events.push({ id: 'fake', challengeId: 'number-0', kind: 'attempt', at: now, answer: '99', matched: true, assisted: false });
    expect(sandboxSessionSchema.safeParse(forged).success).toBe(false);
  });
});
