import { episodeSchema, valueKey, type Episode, type PrivateEpisode, type Values } from './contracts.js';

/** Evaluator-owned exhaustive solver for the declared finite classes; never a learner tool. */
export function referenceAnswers(raw: Episode, challengeId: string): Values[] {
  const e = episodeSchema.parse(raw);
  const challenge = e.challenges.find(c => c.id === challengeId);
  if (!challenge) throw new Error('Unknown challenge');
  let values: Values[] = [];
  if (e.task === 'segmentation' && 'surface' in challenge) {
    const vocabulary = [...new Set(e.observations.flatMap(o => o.segments))].sort();
    const memo = new Map<number, Values[]>();
    const solve = (position: number): Values[] => {
      if (position === challenge.surface.length) return [[]];
      if (memo.has(position)) return memo.get(position)!;
      const answers: Values[] = [];
      for (const token of vocabulary) if (challenge.surface.startsWith(token, position)) {
        for (const rest of solve(position + token.length)) {
          answers.push([token, ...rest]);
          // Seventeen proves the protocol's 16-alternative bound has been exceeded.
          if (answers.length === 17) { memo.set(position, answers); return answers; }
        }
      }
      memo.set(position, answers); return answers;
    };
    values = solve(0);
  } else if (e.task === 'lexical' && 'form' in challenge) {
    const forward = new Map<string, string>(), inverse = new Map<string, string>();
    for (const o of e.observations) {
      if ((forward.has(o.form) && forward.get(o.form) !== o.meaning) ||
          (inverse.has(o.meaning) && inverse.get(o.meaning) !== o.form)) return [];
      forward.set(o.form, o.meaning); inverse.set(o.meaning, o.form);
    }
    if (!e.formCandidates.includes(challenge.form)) return [];
    values = forward.has(challenge.form) ? [[forward.get(challenge.form)!]] :
      e.meaningCandidates.filter(m => !inverse.has(m)).map(m => [m]);
  } else if (e.task === 'correspondence' && 'source' in challenge) {
    if (!e.observations.length) return [];
    const sourceSymbols = new Set(e.observations.flatMap(o => o.source));
    if (challenge.source.some(s => !sourceSymbols.has(s))) return [];
    const alphabet = [...new Set(e.observations.flatMap(o => [...o.source, ...o.target]))].sort();
    if (alphabet.length > 32) throw new Error('Reference correspondence alphabet exceeds bounded class');
    const rules: ((source: string[]) => string[])[] = [source => [...source]];
    for (const from of alphabet) for (const to of alphabet) if (from !== to) {
      for (const position of ['all', 'initial', 'final']) rules.push(source => source.map((s, i) =>
        s === from && (position === 'all' || (position === 'initial' ? i === 0 : i === source.length - 1)) ? to : s));
    }
    values = rules.filter(rule => e.observations.every(o => valueKey(rule(o.source)) === valueKey(o.target)))
      .map(rule => rule(challenge.source));
  } else if (e.task === 'morphology' && 'lemma' in challenge) {
    const features = JSON.stringify([...challenge.features].sort());
    const observations = e.observations.filter(o => JSON.stringify([...o.features].sort()) === features);
    if (!observations.length) return [];
    const first = observations[0], form = Array.from(first.form);
    for (let p = 0; p <= 2; p++) for (let s = 0; s <= 2; s++) {
      const prefix = form.slice(0, p).join(''), suffix = s ? form.slice(-s).join('') : '';
      if (p + s <= form.length && observations.every(o => prefix + o.lemma + suffix === o.form))
        values.push([prefix + challenge.lemma + suffix]);
    }
  }
  return [...new Map(values.map(v => [valueKey(v), v])).values()].sort((a, b) =>
    valueKey(a) < valueKey(b) ? -1 : valueKey(a) > valueKey(b) ? 1 : 0);
}

export function inferTruth(learner: Episode): PrivateEpisode['truth'] {
  return learner.challenges.map(c => {
    const answers = referenceAnswers(learner, c.id);
    if (!answers.length || answers.length > 16) return { id: c.id, status: 'insufficient' as const, acceptable: [] };
    return answers.length === 1 ? { id: c.id, status: 'identified' as const, acceptable: answers } :
      { id: c.id, status: 'ambiguous' as const, acceptable: answers };
  });
}
