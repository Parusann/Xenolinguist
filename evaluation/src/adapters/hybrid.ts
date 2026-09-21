import type { Input, Output, Context } from '../contracts.js';
import { symbolic } from './symbolic.js';
import { llmOnly, localCompletion, type Completion } from './llm-only.js';

/** Symbolic consensus first; one model call with inferred hints for unresolved predictions. */
export async function hybrid(input: Input, context: Context, complete: Completion = localCompletion): Promise<Output> {
  const rules = await symbolic(input);
  if ([...rules.predictions, ...rules.lexical].every(p => p.status === 'answered')) return { ...rules, diagnostics: { ...rules.diagnostics, route: 'symbolic-only' } };
  const model = await llmOnly(input, context, complete, { hypotheses: rules.diagnostics.hypotheses, predictions: rules.predictions, lexical: rules.lexical });
  return { predictions: rules.predictions.map((p, i) => p.status === 'answered' ? p : model.predictions[i]),
    lexical: rules.lexical.map((p, i) => p.status === 'answered' ? p : model.lexical[i]),
    diagnostics: { route: 'symbolic-then-model', modelUsed: true, symbolic: rules, model } };
}
