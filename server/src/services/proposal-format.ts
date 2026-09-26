import { z } from 'zod';
import { proposalActionSchema } from '../../../shared/schemas/proposals.js';

/** Ollama's grammar compiler does not accept JavaScript Unicode-property regex escapes.
 * Omit only those provider-side patterns; the authoritative Zod parser still enforces them.
 * Keep structural constraints, enums, bounds and ASCII identifier patterns intact. */
export function proposalOutputFormat(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(z.toJSONSchema(proposalActionSchema), (key, value: unknown) =>
    key === 'pattern' && typeof value === 'string' && /\\[pP]\{/.test(value) ? undefined : value));
}
