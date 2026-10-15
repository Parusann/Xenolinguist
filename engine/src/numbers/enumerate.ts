import { NUMBER_BASES, NUMBER_LIMITS as LIMIT, type NumberInput, type NumberGrammar } from './grammar.js';

/** Family enumeration uses fit forms only. Validation never supplies atoms or linkers. */
export function enumerateNumbers(input: NumberInput): { grammars: NumberGrammar[]; limited: boolean } {
  const grammars: NumberGrammar[] = [];
  for (const base of NUMBER_BASES) {
    const atoms = Object.fromEntries(input.fit.filter(o => o.value <= base).map(o => [o.value, o.form]));
    const root = atoms[base];
    if (!root) continue;
    const joiners = new Set(['', ' ', '-']);
    for (const observation of input.fit.filter(o => o.value > base)) for (const form of Object.values(atoms)) {
      for (const [left, right] of [[root, form], [form, root]]) {
        if (observation.form.startsWith(left) && observation.form.endsWith(right) && observation.form.length >= left.length + right.length) {
          const middle = observation.form.slice(left.length, observation.form.length - right.length);
          if (middle.length <= 12 && !/[\u0000-\u001f]/u.test(middle)) joiners.add(middle);
        }
      }
    }
    if (joiners.size > LIMIT.joiners) return { grammars: [], limited: true };
    for (const additionJoiner of [...joiners].sort()) for (const additionOrder of ['high-first', 'low-first'] as const) {
      grammars.push({ base, atoms, kind: 'additive', additionOrder, additionJoiner, multiplicationOrder: 'coefficient-first', multiplicationJoiner: '' });
      for (const multiplicationJoiner of [...joiners].sort()) for (const multiplicationOrder of ['coefficient-first', 'base-first'] as const)
        grammars.push({ base, atoms, kind: 'multiplicative', additionOrder, additionJoiner, multiplicationOrder, multiplicationJoiner });
      if (grammars.length > LIMIT.candidates) return { grammars: [], limited: true };
    }
  }
  return { grammars, limited: false };
}
