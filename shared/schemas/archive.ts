import { z } from 'zod';
import { entityIdSchema, timestampSchema } from './common.js';

export const ARCHIVE_LIMITS = { bytes: 256 * 1024 * 1024, memberBytes: 32 * 1024 * 1024,
  profileBytes: 10 * 1024 * 1024, manifestBytes: 1024 * 1024, entries: 2048, ratio: 100, previewMs: 10 * 60 * 1000 } as const;
export const archiveMemberSchema = z.strictObject({
  path: z.string().regex(/^(profile\.json|compiler-session\.json|audio\/[A-Za-z0-9_-]{1,128}\/(original|analysis|legacy\.wav|legacy\.webm))$/),
  bytes: z.number().int().positive().max(ARCHIVE_LIMITS.memberBytes), sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const archiveManifestSchema = z.strictObject({
  format: z.literal('xenolinguist'), archiveVersion: z.union([z.literal(1), z.literal(2)]), profileSchemaVersion: z.union([z.literal(2), z.literal(3)]),
  createdAt: timestampSchema, sourceProfileId: entityIdSchema, sourceRevision: z.number().int().nonnegative(),
  sandboxIncluded: z.boolean(), members: z.array(archiveMemberSchema).min(1).max(ARCHIVE_LIMITS.entries - 1),
});
export type ArchiveManifest = z.infer<typeof archiveManifestSchema>;
export const archiveRestoreSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('new') }),
  z.strictObject({ mode: z.literal('replace'), targetId: entityIdSchema, expectedRevision: z.number().int().nonnegative() }),
]);
export type ArchiveRestore = z.infer<typeof archiveRestoreSchema>;
export interface ArchivePreview {
  token: string; expiresAt: string; name: string; sourceRevision: number; sandboxIncluded: boolean;
  counts: { words: number; rules: number; samples: number; recordings: number; proposals: number; snapshots: number };
  expandedBytes: number; warnings: string[];
}
