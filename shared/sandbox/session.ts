import { buildChallenges, conlangSchema, sandboxSessionSchema, type SandboxSession, type SandboxChallenge } from '../schemas/sandbox.js';
import { GRADING_VERSION, matchAccepted, matchInteger, normalizeAnswer, submissionKey } from './grading.js';
import type { LanguageProfile, PartOfSpeech } from '../types.js';

export function createSandboxSession(input: unknown, id: string, createdAt: string, generatorModel: string): SandboxSession {
  const conlang = conlangSchema.parse(input);
  return sandboxSessionSchema.parse({ version: 1, gradingVersion: GRADING_VERSION, id, createdAt, generatorModel, conlang,
    challenges: buildChallenges(conlang), step: 1, completed: false, guesses: {}, events: [], visibleNumbers: 3, visibleVocabulary: 3, sentenceIndex: 0, wordMode: [] });
}
export function challengeProgress(session: SandboxSession, id: string) {
  const events = session.events.filter(event => event.challengeId === id);
  const attempts = events.filter(event => event.kind === 'attempt');
  const revealed = events.some(event => event.kind === 'reveal');
  return { attempts, hints: events.filter(event => event.kind === 'hint').length, revealed,
    matched: attempts.some(event => event.matched), solved: revealed || attempts.some(event => event.matched), last: attempts.at(-1) };
}
export function sandboxStats(session: SandboxSession) {
  const scored = session.challenges.filter(challenge => ['number', 'vocabulary', 'sentence'].includes(challenge.kind));
  const progress = scored.map(challenge => challengeProgress(session, challenge.id));
  const attempted = progress.filter(p => p.attempts.length > 0).length;
  return { attempted, total: scored.length,
    unaidedFirst: progress.filter(p => p.attempts[0]?.matched && !p.attempts[0]?.assisted).length,
    retries: progress.reduce((sum, p) => sum + Math.max(0, p.attempts.length - 1), 0),
    hints: session.events.filter(event => event.kind === 'hint').length,
    revealed: progress.filter(p => p.revealed).length, solved: progress.filter(p => p.solved).length };
}
export function canAdvance(session: SandboxSession, step = session.step) {
  const solved = (kind: SandboxChallenge['kind']) => session.challenges.filter(c => c.kind === kind && challengeProgress(session, c.id).solved).length;
  const count = (kind: SandboxChallenge['kind']) => session.challenges.filter(c => c.kind === kind).length;
  if (step === 1) return solved('number') >= Math.min(3, count('number'));
  if (step === 2) return solved('vocabulary') >= Math.min(3, count('vocabulary'));
  if (step === 3) return solved('sentence') >= 1;
  return solved('grammar') === count('grammar');
}
export type SandboxAction = { type: 'guess'; challengeId: string; value: string } | { type: 'check' | 'hint' | 'reveal'; challengeId: string } |
  { type: 'step'; value: number } | { type: 'sentence'; value: number } | { type: 'word-mode'; challengeId: string } |
  { type: 'more'; kind: 'number' | 'vocabulary' } | { type: 'complete' };

function pos(value: string): PartOfSpeech {
  const names: Record<string, PartOfSpeech> = { noun: 'noun', n: 'noun', verb: 'verb', v: 'verb', adjective: 'adjective', adj: 'adjective', pron: 'pronoun', pronoun: 'pronoun', number: 'number', num: 'number', connector: 'connector', conjunction: 'connector', conj: 'connector', particle: 'particle' };
  return names[value.toLowerCase()] ?? 'unknown';
}
/** Pure transition: the event and any resulting workspace entry share one profile mutation. */
export function applySandboxAction(profile: LanguageProfile, sessionId: string, action: SandboxAction, eventId: string, at: string): LanguageProfile {
  if (!profile.sandbox_session || profile.sandbox_session.id !== sessionId) return profile;
  const session = structuredClone(profile.sandbox_session);
  if (session.events.some(event => event.id === eventId)) return profile;
  const next = { ...profile, sandbox_session: session };
  if (action.type === 'step') {
    if (Number.isInteger(action.value) && action.value >= 1 && action.value <= 4 && (action.value <= session.step || (action.value === session.step + 1 && canAdvance(session)))) session.step = action.value;
  } else if (action.type === 'sentence') {
    if (Number.isInteger(action.value) && action.value >= 0 && action.value < session.conlang.sample_sentences.length) session.sentenceIndex = action.value;
  } else if (action.type === 'more') {
    if (action.kind === 'number') session.visibleNumbers = Math.min(100, session.visibleNumbers + 3);
    else session.visibleVocabulary = Math.min(100, session.visibleVocabulary + 3);
  } else if (action.type === 'complete') {
    if ([1, 2, 3, 4].every(step => canAdvance(session, step))) session.completed = true;
  } else {
    const challenge = session.challenges.find(c => c.id === action.challengeId);
    if (!challenge) return profile;
    const progress = challengeProgress(session, challenge.id);
    if (action.type === 'word-mode') {
      if (challenge.kind !== 'sentence') return profile;
      if (session.wordMode.includes(challenge.id)) session.wordMode = session.wordMode.filter(id => id !== challenge.id);
      else {
        session.wordMode.push(challenge.id);
        if (!progress.solved && !progress.hints) session.events.push({ id: eventId, kind: 'hint', challengeId: challenge.id, at });
      }
      return next;
    }
    if (progress.solved || session.completed) return profile;
    if (action.type === 'guess') { session.guesses[challenge.id] = action.value.slice(0, 2000); return next; }
    if (action.type === 'hint') {
      if (challenge.kind === 'grammar' || progress.hints >= 2) return profile;
      session.events.push({ id: eventId, kind: 'hint', challengeId: challenge.id, at }); return next;
    }
    if (action.type === 'check') {
      if (challenge.kind === 'grammar') return profile;
      const answer = session.guesses[challenge.id] ?? '';
      const integer = challenge.kind === 'number' || (challenge.kind === 'token' && Object.values(session.conlang.number_words).some(word => normalizeAnswer(word) === normalizeAnswer(challenge.prompt)));
      if (!submissionKey(answer, integer) || (progress.last && submissionKey(progress.last.answer, integer) === submissionKey(answer, integer))) return profile;
      const matched = integer ? matchInteger(answer, challenge.accepted[0]) : matchAccepted(answer, challenge.accepted);
      const relatedHelp = session.events.some(event => {
        const related = session.challenges.find(c => c.id === event.challengeId);
        return related?.kind === 'token' && normalizeAnswer(related.prompt) === normalizeAnswer(challenge.prompt)
          && (event.kind !== 'attempt' || event.matched);
      });
      session.events.push({ id: eventId, kind: 'attempt', challengeId: challenge.id, at, answer, matched, assisted: progress.hints > 0 || challenge.kind === 'token' || relatedHelp });
      if (!matched) return next;
    } else {
      session.events.push({ id: eventId, kind: 'reveal', challengeId: challenge.id, at });
      session.guesses[challenge.id] = challenge.accepted[0];
    }
    const id = `sandbox-${session.id}-${challenge.id}`;
    const notes = action.type === 'reveal' ? 'Revealed practice answer; not unaided evidence.' : 'Matched a generated practice answer; not a linguistic validation.';
    if (challenge.kind === 'number' || challenge.kind === 'vocabulary') {
      const existing = profile.dictionary.some(entry => normalizeAnswer(entry.alien_word) === normalizeAnswer(challenge.prompt) && normalizeAnswer(entry.english_meaning) === normalizeAnswer(challenge.accepted[0]));
      if (!existing) next.dictionary = [...profile.dictionary, { id, created_at: at, alien_word: challenge.prompt, english_meaning: challenge.accepted[0],
        part_of_speech: challenge.kind === 'number' ? 'number' : pos(session.conlang.vocabulary.find(v => v.alien === challenge.prompt)!.pos),
        confidence: 50, context: 'Generated sandbox practice', examples: [], notes }];
      if (challenge.kind === 'number') next.number_system = { ...profile.number_system, base: profile.number_system.base ?? session.conlang.number_base,
        mappings: { ...profile.number_system.mappings, [challenge.accepted[0]]: challenge.prompt } };
    } else if (challenge.kind === 'sentence') {
      if (!profile.samples.some(sample => sample.id === id)) next.samples = [...profile.samples, { id, created_at: at, alien_text: challenge.prompt,
        english_translation: challenge.accepted[0], source: 'Sandbox practice', phonetic_notes: notes, decoded: true, audio_id: null, ipa: null }];
    } else if (challenge.kind === 'grammar' && !profile.grammar_rules.some(rule => normalizeAnswer(rule.rule) === normalizeAnswer(challenge.accepted[0]))) {
      next.grammar_rules = [...profile.grammar_rules, { id, created_at: at, rule: challenge.accepted[0], evidence: ['Generated practice rule, revealed from the answer key'], confidence: 50 }];
    }
  }
  return next;
}
