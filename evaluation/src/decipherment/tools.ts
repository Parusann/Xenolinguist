import { z } from 'zod';
import { episodeSchema, valueKey, type Episode } from './contracts.js';

const text = z.string().max(256).refine(s => s === s.normalize('NFC'));
export const hypothesisSchema = z.discriminatedUnion('task', [
  z.strictObject({ task: z.literal('segmentation'), challengeId: z.string().max(80), segments: z.array(text.min(1)).min(1).max(64) }),
  z.strictObject({ task: z.literal('lexical'), mapping: z.array(z.strictObject({ form: text.min(1), meaning: text.min(1) })).min(1).max(64) }),
  z.strictObject({ task: z.literal('correspondence'), from: text.min(1), to: text.min(1), position: z.enum(['all', 'initial', 'final']) }),
  z.strictObject({ task: z.literal('morphology'), features: z.array(z.string().max(80)).max(8), prefix: text, suffix: text }),
]);

/** Tests one proposed hypothesis against visible evidence; never searches truth or returns a hidden answer. */
export function checkHypothesis(raw: Episode, proposal: unknown) {
  const e = episodeSchema.parse(raw), h = hypothesisSchema.parse(proposal);
  if (h.task !== e.task) throw new Error('Hypothesis task differs from episode');
  const matches: string[] = [], counterexamples: string[] = [];
  if (e.task === 'segmentation' && h.task === 'segmentation') {
    const c = e.challenges.find(c => c.id === h.challengeId);
    if (!c) throw new Error('Unknown challenge ID');
    const vocab = new Set(e.observations.flatMap(o => o.segments));
    return { compatible: h.segments.join('') === c.surface && h.segments.every(s => vocab.has(s)),
      note: 'Compatibility of this segmentation does not prove uniqueness.' };
  }
  if (e.task === 'lexical' && h.task === 'lexical') {
    const forms = h.mapping.map(m => m.form), meanings = h.mapping.map(m => m.meaning);
    if (new Set(forms).size !== forms.length || new Set(meanings).size !== meanings.length ||
        forms.some(f => !e.formCandidates.includes(f)) || meanings.some(m => !e.meaningCandidates.includes(m)))
      return { compatible: false, note: 'Mapping is not a partial bijection within the inventories.' };
    for (const o of e.observations) {
      const pair = h.mapping.find(m => m.form === o.form), inverse = h.mapping.find(m => m.meaning === o.meaning);
      if ((pair && pair.meaning !== o.meaning) || (inverse && inverse.form !== o.form)) counterexamples.push(o.id);
      else if (pair) matches.push(o.id);
    }
  }
  if (e.task === 'correspondence' && h.task === 'correspondence') {
    const alphabet = new Set(e.observations.flatMap(o => [...o.source, ...o.target]));
    if (!alphabet.has(h.from) || !alphabet.has(h.to)) throw new Error('Replacement symbol outside observed alphabet');
    for (const o of e.observations) {
      const predicted = o.source.map((s, i) => s === h.from && (h.position === 'all' || (h.position === 'initial' ? i === 0 : i === o.source.length - 1)) ? h.to : s);
      (valueKey(predicted) === valueKey(o.target) ? matches : counterexamples).push(o.id);
    }
  }
  if (e.task === 'morphology' && h.task === 'morphology') {
    if (Array.from(h.prefix).length > 2 || Array.from(h.suffix).length > 2 || new Set(h.features).size !== h.features.length) throw new Error('Affix or feature bound exceeded');
    for (const o of e.observations.filter(o => valueKey([...o.features].sort()) === valueKey([...h.features].sort())))
      (h.prefix + o.lemma + h.suffix === o.form ? matches : counterexamples).push(o.id);
  }
  return { compatible: counterexamples.length === 0, matches, counterexamples,
    note: 'Compatibility is conditional on the visible observations. It does not prove uniqueness or adequate evidence.' };
}
