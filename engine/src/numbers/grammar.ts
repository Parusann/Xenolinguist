import { NUMBER_LIMITS as LIMIT, numberGrammarSchema, numeralValueSchema, type NumberGrammar, type NumberExpression } from '../../../shared/schemas/numbers.js';
export { NUMBER_LIMITS, numberInputSchema, numberGrammarSchema } from '../../../shared/schemas/numbers.js';
export type { NumberGrammar, NumberExpression, NumberInput, NumberObservation } from '../../../shared/schemas/numbers.js';
export const NUMBER_VERSION = 'number-grammar-1';
export const NUMBER_BASES = [...Array.from({ length: 19 }, (_, i) => i + 2), 24, 30, 36];
export type NumberPrediction = { status: 'predicted'; form: string; tree: NumberExpression } | { status: 'unknown' | 'limit' | 'invalid'; reason: string };
export function normalizeNumberForm(form: string, caseSensitive: boolean) {
  const value = form.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return (caseSensitive ? value : value.toLowerCase()).normalize('NFC');
}

/** Internal generation from a validated grammar; no arbitrary mapped exceptions. */
export function composeNumber(grammar: NumberGrammar, value: number): NumberPrediction {
  if (!Number.isInteger(grammar.base) || grammar.base < 2 || grammar.base > 36 || !numeralValueSchema.safeParse(value).success)
    return { status: 'invalid', reason: 'Use an integer from 0 to 4095 and a base from 2 to 36.' };
  let nodes = 0;
  const atom = (n: number): NumberExpression => {
    if (!grammar.atoms[n]) throw new Error('unknown');
    if (++nodes > LIMIT.nodes) throw new Error('limit');
    return { kind: 'atom', value: n, form: grammar.atoms[n] };
  };
  const join = (kind: 'add' | 'multiply', left: NumberExpression, right: NumberExpression): NumberExpression => {
    if (++nodes > LIMIT.nodes) throw new Error('limit');
    const n = kind === 'add' ? left.value + right.value : left.value * right.value;
    const reversed = kind === 'add' ? grammar.additionOrder === 'low-first' : grammar.multiplicationOrder === 'base-first';
    const separator = kind === 'add' ? grammar.additionJoiner : grammar.multiplicationJoiner;
    const form = (reversed ? [right.form, left.form] : [left.form, right.form]).join(separator);
    if (form.length > LIMIT.output || n > LIMIT.value) throw new Error('limit');
    return { kind, value: n, form, left, right };
  };
  const build = (n: number, depth: number): NumberExpression => {
    if (depth > LIMIT.depth) throw new Error('limit');
    if (n <= grammar.base) return atom(n);
    const quotient = Math.floor(n / grammar.base), remainder = n % grammar.base;
    let high: NumberExpression;
    if (grammar.kind === 'additive') {
      if (quotient * 2 - 1 > LIMIT.nodes || quotient > LIMIT.depth) throw new Error('limit');
      high = atom(grammar.base);
      for (let i = 1; i < quotient; i++) high = join('add', high, atom(grammar.base));
    } else high = quotient === 1 ? atom(grammar.base) : join('multiply', build(quotient, depth + 1), atom(grammar.base));
    return remainder ? join('add', high, atom(remainder)) : high;
  };
  try { const tree = build(value, 0); return { status: 'predicted', form: tree.form, tree }; }
  catch (error) { return error instanceof Error && error.message === 'limit'
    ? { status: 'limit', reason: 'Composition exceeds the node, depth or output bound.' }
    : { status: 'unknown', reason: 'A required grounded atom is missing.' }; }
}
export function predictNumber(grammar: unknown, value: number): NumberPrediction {
  const parsed = numberGrammarSchema.safeParse(grammar);
  return parsed.success ? composeNumber(parsed.data, value) : { status: 'invalid', reason: 'Invalid number grammar.' };
}
