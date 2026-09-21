import { z } from 'zod';

// Additive profile-v2 fields: old glosses remain unstructured display text.
const form = z.string().trim().min(1).max(512);
export const lexicalSenseSchema = z.strictObject({
  meaning: form,
  aliases: z.array(form).max(64),
});
export const lexicalPolicySchema = z.strictObject({
  caseSensitive: z.boolean(),
  apostrophes: z.enum(['internal', 'boundary']),
  hyphens: z.enum(['internal', 'boundary']),
  segmentation: z.enum(['whitespace', 'dictionary']),
});
