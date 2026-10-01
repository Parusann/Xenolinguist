import { z } from 'zod'
import { grammarSetupSchema } from 'shared/schemas/grammar-elicitation'
import type { MeaningTree } from 'engine/grammar/ast'
import { stableKey } from 'engine/elicitation/contracts'
import { renderEnglish } from 'engine/translation/render'

export const grammarDraftSchema = z.strictObject({ candidates: grammarSetupSchema.shape.candidates,
  anchors: z.array(grammarSetupSchema.shape.anchors.element).max(16),
  available: z.array(grammarSetupSchema.shape.available.element).max(64) })
export const initialGrammarSetup = { candidates: [{ id: 'A', rule_ids: [] }, { id: 'B', rule_ids: [] }], anchors: [], available: [] }
export function meaningLabel(meaning: MeaningTree) {
  const result = renderEnglish(meaning)
  return result.status === 'rendered' ? result.text : stableKey(meaning)
}
