import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { independentControls } from './archive.js';
import { lookup, surfaceHeuristic } from './baselines.js';
import { scoreEpisode, summarizeItems } from './score.js';
import { checkHypothesis } from './tools.js';

it('exposes the simple controls weaknesses on independent examples', async () => {
  const controls = await independentControls();
  const simple = summarizeItems(controls.flatMap(e => scoreEpisode(e, { status: 'complete', response: surfaceHeuristic(e.learner) })));
  expect(simple.falseClaims).toBe(3); // Greedy segmentation, unconditioned replacement and first affix guess.
  expect(simple.identifiedAccuracy).toBe(1);
  expect(summarizeItems(controls.flatMap(e => scoreEpisode(e, { status: 'complete', response: lookup(e.learner) }))).falseClaims).toBe(1); // A memorized boundary choice can still be ambiguous.
});

it('checks visible hypotheses, retaining contradictions without claiming uniqueness', async () => {
  const controls = await independentControls();
  const sound = controls.find(e => e.learner.task === 'correspondence')!.learner;
  for (const position of ['all', 'initial', 'final'])
    expect(checkHypothesis(sound, { task: 'correspondence', from: 'p', to: 'f', position })).toMatchObject({ compatible: true });
  expect(checkHypothesis(sound, { task: 'correspondence', from: 'a', to: 'f', position: 'all' })).toMatchObject({ compatible: false, counterexamples: ['o0', 'o1'] });
  expect(() => checkHypothesis(sound, { task: 'correspondence', from: 'secret', to: 'f', position: 'all' })).toThrow();
  expect(() => checkHypothesis(sound, { task: 'correspondence', from: 'p', to: 'f', position: 'all', truth: [] })).toThrow();
});

it('keeps learner algorithms and tools independent of evaluator modules', async () => {
  for (const name of ['baselines', 'tools', 'model']) {
    const source = await readFile(new URL(name + '.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"].*(?:reference|corpus|archive|score|wold)\.js['"]/);
  }
});
