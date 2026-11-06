import { z } from 'zod';

export const ATLAS_LIMITS = { bytes: 5 * 1024 * 1024, rows: 5000, datasets: 10, versions: 20,
  accountBytes: 256 * 1024 * 1024, queuedJobs: 100, candidates: 50, jobMs: 60000 } as const;
export const atlasId = z.uuid();
const note = z.string().trim().min(1).max(2048);
export const datasetInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  languageKind: z.enum(['known', 'unknown', 'conlang', 'synthetic']),
  glottocode: z.string().regex(/^[a-z]{4}[0-9]{4}$/).optional(),
});
export const versionMetadataSchema = z.strictObject({
  rights: z.strictObject({
    license: z.string().trim().min(1).max(120),
    creator: z.string().trim().min(1).max(256),
    sourceUrl: z.url().max(2048).refine(value => ['http:', 'https:'].includes(new URL(value).protocol)).optional(),
    notes: note.optional(),
  }),
  features: z.partialRecord(z.enum(['word_order', 'adposition_order', 'morphology', 'plural_position', 'case_marking']),
    z.strictObject({ value: z.string().trim().min(1).max(80), source: note, status: z.enum(['observed', 'hypothesis']) })).default({}),
});
export const uploadFormatSchema = z.enum(['csv', 'json', 'text']);
export const uploadInputSchema = z.strictObject({
  key: atlasId, format: uploadFormatSchema, content: z.string().min(1).max(ATLAS_LIMITS.bytes),
  metadata: versionMetadataSchema,
});
export type DatasetInput = z.infer<typeof datasetInputSchema>;
export type VersionMetadata = z.infer<typeof versionMetadataSchema>;
export type UploadInput = z.infer<typeof uploadInputSchema>;
