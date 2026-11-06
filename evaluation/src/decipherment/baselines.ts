import { episodeSchema, PROTOCOL, valueKey, type Episode, type Prediction, type Response } from './contracts.js';
import { compareLexical } from '../../../engine/src/comparison/lexical.js';

const abstain = (id: string): Prediction => ({ id, kind: 'abstain', reason: 'insufficient-evidence' });
const answer = (id: string, value: string[], evidenceIds: string[], confidence = 0.5): Prediction => ({ id, kind: 'answer', value, evidenceIds, confidence });
const featureKey = (features: string[]) => JSON.stringify([...features].sort());

/** Memorization control; no generator, scorer or reference-solver imports. */
export function lookup(raw: Episode): Response {
  const e = episodeSchema.parse(raw);
  const predictions = e.challenges.map(c => {
    let matches: { id: string; value: string[] }[] = [];
    if (e.task === 'segmentation' && 'surface' in c)
      matches = e.observations.filter(o => o.surface === c.surface).map(o => ({ id: o.id, value: o.segments }));
    if (e.task === 'lexical' && 'form' in c)
      matches = e.observations.filter(o => o.form === c.form).map(o => ({ id: o.id, value: [o.meaning] }));
    if (e.task === 'correspondence' && 'source' in c)
      matches = e.observations.filter(o => valueKey(o.source) === valueKey(c.source)).map(o => ({ id: o.id, value: o.target }));
    if (e.task === 'morphology' && 'lemma' in c)
      matches = e.observations.filter(o => o.lemma === c.lemma && featureKey(o.features) === featureKey(c.features)).map(o => ({ id: o.id, value: [o.form] }));
    return matches.length && new Set(matches.map(m => valueKey(m.value))).size === 1 ? answer(c.id, matches[0].value, matches.map(m => m.id), 1) : abstain(c.id);
  });
  return { protocol: PROTOCOL, predictions };
}

/** Intentionally simple heuristics, not an exhaustive identifiability solver. Confidence 0.5 is fixed, not calibrated. */
export function surfaceHeuristic(raw: Episode): Response {
  const e = episodeSchema.parse(raw);
  const predictions = e.challenges.map(c => {
    const evidence = e.observations.map(o => o.id);
    if (e.task === 'segmentation' && 'surface' in c) {
      const vocab = [...new Set(e.observations.flatMap(o => o.segments))].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
      const result: string[] = []; let rest = c.surface;
      while (rest) {
        const token = vocab.find(t => rest.startsWith(t));
        if (!token || result.length >= 64) return abstain(c.id);
        result.push(token); rest = rest.slice(token.length);
      }
      return answer(c.id, result, evidence);
    }
    if (e.task === 'lexical' && 'form' in c) {
      const proposal = compareLexical({ assumption: 'closed-bijective-inventory', forms: e.formCandidates,
        meanings: e.meaningCandidates, anchors: e.observations, query: c.form });
      const candidates = proposal.meanings;
      if (candidates.length === 1) return answer(c.id, [candidates[0]], evidence);
      if (candidates.length > 1 && candidates.length <= 16)
        return { id: c.id, kind: 'alternatives' as const, values: candidates.map(m => [m]), evidenceIds: evidence };
      return abstain(c.id);
    }
    if (e.task === 'correspondence' && 'source' in c) {
      const mapping = new Map<string, string>();
      for (const o of e.observations) {
        if (o.source.length !== o.target.length) return abstain(c.id);
        for (let i = 0; i < o.source.length; i++) {
          if (mapping.has(o.source[i]) && mapping.get(o.source[i]) !== o.target[i]) return abstain(c.id);
          mapping.set(o.source[i], o.target[i]);
        }
      }
      if (c.source.some(s => !mapping.has(s))) return abstain(c.id);
      return answer(c.id, c.source.map(s => mapping.get(s)!), evidence);
    }
    if (e.task === 'morphology' && 'lemma' in c) {
      const examples = e.observations.filter(o => featureKey(o.features) === featureKey(c.features));
      if (!examples.length) return abstain(c.id);
      const first = examples[0], position = first.form.indexOf(first.lemma);
      if (position < 0) return abstain(c.id);
      const prefix = first.form.slice(0, position), suffix = first.form.slice(position + first.lemma.length);
      if (Array.from(prefix).length > 2 || Array.from(suffix).length > 2 || examples.some(o => prefix + o.lemma + suffix !== o.form)) return abstain(c.id);
      return answer(c.id, [prefix + c.lemma + suffix], examples.map(o => o.id));
    }
    return abstain(c.id);
  });
  return { protocol: PROTOCOL, predictions };
}
