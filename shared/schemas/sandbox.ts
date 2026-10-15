import { z } from 'zod';
import { entityIdSchema, timestampSchema } from './common.js';
import type { LearnerInput } from '../../engine/src/types.js';
import { GRADING_VERSION, matchAccepted, matchInteger, normalizeAnswer, sentenceTokens, submissionKey } from '../sandbox/grading.js';

const text = z.string().trim().min(1).max(2000).refine(value => normalizeAnswer(value).length > 0, 'Text must contain more than punctuation');
const forms = z.array(text).max(20).default([]);
export const conlangSchema = z.strictObject({
  language_name: text, phoneme_set: z.array(text).min(1).max(100), number_base: z.number().int().min(2).max(36),
  word_order: text, rules: z.array(text).min(1).max(30),
  vocabulary: z.array(z.strictObject({ alien: text, english: text, pos: text, accepted_forms: forms })).min(1).max(100),
  number_words: z.record(z.string().regex(/^(0|[1-9]\d{0,5})$/), text),
  sample_sentences: z.array(z.strictObject({ alien: text, english: text, accepted_forms: forms })).min(1).max(30),
}).superRefine((data, ctx) => {
  const numbers = Object.values(data.number_words);
  if (numbers.length < 3 || numbers.length > 100) ctx.addIssue({ code: 'custom', path: ['number_words'], message: 'Provide 3–100 number words' });
  const words = [...numbers, ...data.vocabulary.map(word => word.alien)].map(normalizeAnswer);
  if (new Set(words).size !== words.length) ctx.addIssue({ code: 'custom', path: ['vocabulary'], message: 'Number and vocabulary spellings must be unique after normalization' });
  if (words.some(word => /\s/u.test(word))) ctx.addIssue({ code: 'custom', path: ['vocabulary'], message: 'Declare each alien token separately; multiword lexemes are not supported in this practice mode' });
  if (new Set(data.rules.map(normalizeAnswer)).size !== data.rules.length) ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Grammar rules must be distinct' });
  const known = new Set(words);
  data.sample_sentences.forEach((sentence, index) => {
    const missing = sentenceTokens(sentence.alien).filter(word => !known.has(word));
    if (missing.length) ctx.addIssue({ code: 'custom', path: ['sample_sentences', index, 'alien'], message: `Declare every sentence token in vocabulary or numbers: ${missing.join(', ')}` });
  });
});
export type ConlangData = z.infer<typeof conlangSchema>;
const challengeSchema = z.strictObject({ id: entityIdSchema, kind: z.enum(['number', 'vocabulary', 'sentence', 'token', 'grammar']),
  prompt: text, accepted: z.array(text).min(1).max(21), parentId: entityIdSchema.optional() });
export type SandboxChallenge = z.infer<typeof challengeSchema>;
export function buildChallenges(data: ConlangData): SandboxChallenge[] {
  const numbers = Object.entries(data.number_words).map(([value, word], index): SandboxChallenge => ({ id: `number-${index}`, kind: 'number', prompt: word, accepted: [value] }));
  const vocabulary = data.vocabulary.map((word, index): SandboxChallenge => ({ id: `vocabulary-${index}`, kind: 'vocabulary', prompt: word.alien, accepted: [word.english, ...word.accepted_forms] }));
  const lexicon = [...numbers, ...vocabulary];
  const sentences = data.sample_sentences.flatMap((sentence, index): SandboxChallenge[] => [
    { id: `sentence-${index}`, kind: 'sentence', prompt: sentence.alien, accepted: [sentence.english, ...sentence.accepted_forms] },
    ...sentenceTokens(sentence.alien).map((word, token): SandboxChallenge => ({ id: `token-${index}-${token}`, kind: 'token', prompt: word,
      accepted: lexicon.find(entry => normalizeAnswer(entry.prompt) === word)?.accepted ?? [word], parentId: `sentence-${index}` })),
  ]);
  return [...numbers, ...vocabulary, ...sentences, ...data.rules.map((rule, index): SandboxChallenge => ({ id: `grammar-${index}`, kind: 'grammar', prompt: `Rule ${index + 1}`, accepted: [rule] }))];
}
const eventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ id: entityIdSchema, challengeId: entityIdSchema, at: timestampSchema, kind: z.literal('attempt'), answer: z.string().max(2000), matched: z.boolean(), assisted: z.boolean() }),
  z.strictObject({ id: entityIdSchema, challengeId: entityIdSchema, at: timestampSchema, kind: z.enum(['hint', 'reveal']) }),
]);
export const sandboxSessionSchema = z.strictObject({
  version: z.literal(1), gradingVersion: z.literal(GRADING_VERSION), id: entityIdSchema.max(64), createdAt: timestampSchema,
  generatorModel: text, conlang: conlangSchema, challenges: z.array(challengeSchema).max(2000),
  step: z.number().int().min(1).max(4), completed: z.boolean(),
  guesses: z.record(entityIdSchema, z.string().max(2000)), events: z.array(eventSchema).max(10000),
  visibleNumbers: z.number().int().min(3).max(100), visibleVocabulary: z.number().int().min(3).max(100),
  sentenceIndex: z.number().int().nonnegative(), wordMode: z.array(entityIdSchema),
}).superRefine((session, ctx) => {
  if (JSON.stringify(buildChallenges(session.conlang)) !== JSON.stringify(session.challenges))
    ctx.addIssue({ code: 'custom', path: ['challenges'], message: 'Challenges must match the stored answer key' });
  const ids = new Set(session.challenges.map(challenge => challenge.id)), events = new Set<string>();
  const solved = new Set<string>(), hinted = new Set<string>();
  for (const event of session.events) {
    if (!ids.has(event.challengeId) || events.has(event.id)) ctx.addIssue({ code: 'custom', path: ['events'], message: 'Unknown challenge or duplicate event ID' });
    events.add(event.id);
    const challenge = session.challenges.find(c => c.id === event.challengeId);
    if (solved.has(event.challengeId)) ctx.addIssue({ code: 'custom', path: ['events'], message: 'Resolved challenges cannot receive more grading events' });
    if (event.kind === 'attempt' && challenge) {
      const integer = challenge.kind === 'number' || (challenge.kind === 'token' && Object.values(session.conlang.number_words).some(word => normalizeAnswer(word) === normalizeAnswer(challenge.prompt)));
      const matched = integer ? matchInteger(event.answer, challenge.accepted[0]) : matchAccepted(event.answer, challenge.accepted);
      if (!submissionKey(event.answer, integer) || challenge.kind === 'grammar' || event.matched !== matched || ((hinted.has(challenge.id) || challenge.kind === 'token') && !event.assisted))
        ctx.addIssue({ code: 'custom', path: ['events'], message: 'Attempt result or assistance does not match the grading contract' });
      if (matched) solved.add(challenge.id);
    } else if (event.kind === 'reveal') solved.add(event.challengeId);
    else if (event.kind === 'hint') hinted.add(event.challengeId);
  }
  if (Object.keys(session.guesses).some(id => !ids.has(id))) ctx.addIssue({ code: 'custom', path: ['guesses'], message: 'Unknown challenge draft' });
  if (session.sentenceIndex >= session.conlang.sample_sentences.length || session.wordMode.some(id => !session.challenges.some(c => c.id === id && c.kind === 'sentence')))
    ctx.addIssue({ code: 'custom', path: ['sentenceIndex'], message: 'Unknown sentence selection' });
});
export type SandboxSession = z.infer<typeof sandboxSessionSchema>;

// Compiler keys are server-owned. This contract contains permitted observations and submitted feedback only.
export const compilerRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('start'), requestId: entityIdSchema, expectedRevision: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal('attempt'), requestId: entityIdSchema, expectedRevision: z.number().int().nonnegative(),
    sessionId: entityIdSchema, challengeId: entityIdSchema, answer: z.string().trim().min(1).max(2000) }),
  z.strictObject({ type: z.literal('reveal'), requestId: entityIdSchema, expectedRevision: z.number().int().nonnegative(), sessionId: entityIdSchema, challengeId: entityIdSchema }),
  z.strictObject({ type: z.literal('close'), requestId: entityIdSchema, expectedRevision: z.number().int().nonnegative(), sessionId: entityIdSchema }),
]);
export interface CompilerView extends LearnerInput {
  sessionId: string; revision: number;
  feedback: { challengeId: string; attempts: number; matched: boolean; revealed: boolean; assisted: boolean; answer?: string; lastAnswer?: string }[];
}
