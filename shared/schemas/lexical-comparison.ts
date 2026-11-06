import { z } from 'zod';

const text = z.string().min(1).max(256).refine(value => value === value.normalize('NFC'), 'Expected NFC text');
const inventory = z.array(text).min(2).max(64).refine(values => new Set(values).size === values.length, 'Duplicate inventory values');

/** This assumption must be supplied explicitly. Ordinary wordlists do not establish a bijection. */
export const lexicalComparisonSchema = z.strictObject({
  assumption: z.literal('closed-bijective-inventory'),
  forms: inventory,
  meanings: inventory,
  anchors: z.array(z.strictObject({ id: text, form: text, meaning: text })).max(128),
  query: text,
}).superRefine((input, context) => {
  if (input.forms.length !== input.meanings.length ||
      input.anchors.some(anchor => !input.forms.includes(anchor.form) || !input.meanings.includes(anchor.meaning)) ||
      new Set(input.anchors.map(anchor => anchor.id)).size !== input.anchors.length)
    context.addIssue({ code: 'custom', message: 'Inventory size, anchor membership or evidence identifiers are invalid' });
});

export type LexicalComparisonInput = z.infer<typeof lexicalComparisonSchema>;
export type LexicalComparisonResult = {
  version: 'lexical-comparison-1';
  method: 'inventory-constraints-1';
  assumption: LexicalComparisonInput['assumption'];
  status: 'identified' | 'ambiguous' | 'insufficient' | 'inconsistent';
  meanings: string[];
  evidenceIds: string[];
  state: 'proposed';
};
