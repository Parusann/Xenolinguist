import { z } from 'zod';

export const entityIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const timestampSchema = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)), 'Invalid timestamp');
export const confidenceSchema = z.number().finite().min(0).max(100);
export const noteSchema = z.string();
