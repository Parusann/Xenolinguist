import { z } from 'zod';

/** A new protocol; never reuse the frozen xeno-generator-1 task labels or scores. */
export const PROTOCOL = 'xeno-decipherment-1' as const;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const text = z.string().min(1).max(256).refine(s => s === s.normalize('NFC'), 'Expected NFC text');
const tokens = z.array(text).min(1).max(64);
const features = z.array(id).max(8).refine(a => new Set(a).size === a.length, 'Duplicate features');
const evidenceIds = z.array(id).max(128).refine(a => new Set(a).size === a.length, 'Duplicate evidence IDs');
const budgets = z.strictObject({
  maxToolCalls: z.number().int().min(0).max(32),
  maxOutputTokens: z.number().int().min(128).max(8192),
  timeoutMs: z.number().int().min(100).max(600000),
});

const observation = {
  segmentation: z.strictObject({ id, surface: text, segments: tokens })
    .refine(o => o.segments.join('') === o.surface, 'Segments must reconstruct the surface'),
  lexical: z.strictObject({ id, form: text, meaning: id }),
  correspondence: z.strictObject({ id, source: tokens, target: tokens }),
  morphology: z.strictObject({ id, lemma: text, features, form: text }),
};
const challenge = {
  segmentation: z.strictObject({ id, surface: text }),
  lexical: z.strictObject({ id, form: text }),
  correspondence: z.strictObject({ id, source: tokens }),
  morphology: z.strictObject({ id, lemma: text, features }),
};
const common = { protocol: z.literal(PROTOCOL), id, budgets };
const rawEpisodeSchema = z.discriminatedUnion('task', [
  z.strictObject({ ...common, task: z.literal('segmentation'),
    observations: z.array(observation.segmentation).max(128),
    challenges: z.array(challenge.segmentation).min(1).max(32) }),
  z.strictObject({ ...common, task: z.literal('lexical'),
    formCandidates: z.array(text).min(2).max(64),
    meaningCandidates: z.array(id).min(2).max(64),
    observations: z.array(observation.lexical).max(128),
    challenges: z.array(challenge.lexical).min(1).max(32) }),
  z.strictObject({ ...common, task: z.literal('correspondence'),
    observations: z.array(observation.correspondence).max(128),
    challenges: z.array(challenge.correspondence).min(1).max(32) }),
  z.strictObject({ ...common, task: z.literal('morphology'),
    observations: z.array(observation.morphology).max(128),
    challenges: z.array(challenge.morphology).min(1).max(32) }),
]);

export const episodeSchema = rawEpisodeSchema.superRefine((episode, ctx) => {
  const ids = [...episode.observations, ...episode.challenges].map(o => o.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate record IDs' });
  if (episode.task === 'lexical') {
    if (episode.formCandidates.length !== episode.meaningCandidates.length ||
        new Set(episode.formCandidates).size !== episode.formCandidates.length)
      ctx.addIssue({ code: 'custom', message: 'Form inventory must be unique and match meaning inventory size' });
    if (new Set(episode.meaningCandidates).size !== episode.meaningCandidates.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate meaning candidates' });
    if (episode.observations.some(o => !episode.meaningCandidates.includes(o.meaning)))
      ctx.addIssue({ code: 'custom', message: 'Observed meaning outside the declared inventory' });
    if (episode.observations.some(o => !episode.formCandidates.includes(o.form)))
      ctx.addIssue({ code: 'custom', message: 'Observed form outside the declared inventory' });
  }
});
export type Episode = z.infer<typeof episodeSchema>;
export type Task = Episode['task'];
export type Values = string[];
export const valueKey = (value: Values) => JSON.stringify(value);
export const setKey = (values: Values[]) => JSON.stringify(values.map(valueKey).sort());
const answerSet = z.array(tokens).max(16).refine(
  values => new Set(values.map(valueKey)).size === values.length, 'Duplicate alternatives');
const truthSchema = z.discriminatedUnion('status', [
  z.strictObject({ id, status: z.literal('identified'), acceptable: answerSet.length(1) }),
  z.strictObject({ id, status: z.literal('ambiguous'), acceptable: answerSet.min(2) }),
  z.strictObject({ id, status: z.literal('insufficient'), acceptable: answerSet.length(0) }),
]);

export const privateEpisodeSchema = z.strictObject({
  learner: episodeSchema,
  truth: z.array(truthSchema).min(1).max(32),
  provenance: z.strictObject({
    generator: id,
    lineage: id,
    split: z.enum(['train', 'development', 'final']),
    mechanisms: z.array(id).min(1).max(8),
    source: z.enum(['synthetic', 'independent-fixture', 'licensed-reference']),
  }),
}).superRefine((episode, ctx) => {
  const expected = new Set(episode.learner.challenges.map(c => c.id));
  if (episode.truth.some(t => !expected.delete(t.id)) || expected.size)
    ctx.addIssue({ code: 'custom', message: 'Truth must cover each challenge exactly once' });
  for (const truth of episode.truth) {
    const c = episode.learner.challenges.find(c => c.id === truth.id);
    if (!c) continue;
    for (const value of truth.acceptable) {
      if (episode.learner.task === 'segmentation' && 'surface' in c && value.join('') !== c.surface)
        ctx.addIssue({ code: 'custom', message: 'Truth segmentation does not reconstruct the input' });
      if (episode.learner.task === 'lexical' &&
        (value.length !== 1 || !episode.learner.meaningCandidates.includes(value[0])))
        ctx.addIssue({ code: 'custom', message: 'Truth meaning outside the declared inventory' });
      if (episode.learner.task === 'morphology' && value.length !== 1)
        ctx.addIssue({ code: 'custom', message: 'Inflection truth requires one complete form' });
    }
  }
});
export type PrivateEpisode = z.infer<typeof privateEpisodeSchema>;

export const predictionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ id, kind: z.literal('answer'), value: tokens,
    confidence: z.number().min(0).max(1), evidenceIds }),
  z.strictObject({ id, kind: z.literal('alternatives'), values: answerSet.min(2), evidenceIds }),
  z.strictObject({ id, kind: z.literal('abstain'), reason: z.enum(['ambiguity', 'insufficient-evidence', 'budget']) }),
]);
export const responseSchema = z.strictObject({
  protocol: z.literal(PROTOCOL),
  predictions: z.array(predictionSchema).max(32),
});
export type Prediction = z.infer<typeof predictionSchema>;
export type Response = z.infer<typeof responseSchema>;

/** Explicit projection: no provenance, truth, seed, source path or evaluation hash. */
export function learnerView(input: PrivateEpisode): Episode {
  const e = privateEpisodeSchema.parse(input).learner;
  const base = { protocol: e.protocol, id: e.id, budgets: { ...e.budgets } };
  switch (e.task) {
    case 'segmentation': return { ...base, task: e.task,
      observations: e.observations.map(o => ({ id: o.id, surface: o.surface, segments: [...o.segments] })),
      challenges: e.challenges.map(c => ({ id: c.id, surface: c.surface })) };
    case 'lexical': return { ...base, task: e.task, formCandidates: [...e.formCandidates], meaningCandidates: [...e.meaningCandidates],
      observations: e.observations.map(o => ({ id: o.id, form: o.form, meaning: o.meaning })),
      challenges: e.challenges.map(c => ({ id: c.id, form: c.form })) };
    case 'correspondence': return { ...base, task: e.task,
      observations: e.observations.map(o => ({ id: o.id, source: [...o.source], target: [...o.target] })),
      challenges: e.challenges.map(c => ({ id: c.id, source: [...c.source] })) };
    case 'morphology': return { ...base, task: e.task,
      observations: e.observations.map(o => ({ id: o.id, lemma: o.lemma, features: [...o.features], form: o.form })),
      challenges: e.challenges.map(c => ({ id: c.id, lemma: c.lemma, features: [...c.features] })) };
  }
}
