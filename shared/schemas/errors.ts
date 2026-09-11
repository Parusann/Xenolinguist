import { z } from 'zod';

export const fieldIssueSchema = z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() });
export const apiErrorSchema = z.object({
  error: z.string(), code: z.string(), message: z.string(), requestId: z.string(),
  retryable: z.boolean(), issues: z.array(fieldIssueSchema).optional(),
});
export type FieldIssue = z.infer<typeof fieldIssueSchema>;
export class ProfileError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues: FieldIssue[];
  readonly retryable: boolean;
  constructor(code: string, message: string, status = 400, issues: FieldIssue[] = [], retryable = false) {
    super(message); this.code = code; this.status = status; this.issues = issues; this.retryable = retryable;
  }
}
export function validationError(error: z.ZodError, code = 'PROFILE_INVALID') {
  return new ProfileError(code, 'Profile validation failed', 400,
    error.issues.map(issue => ({ path: issue.path.map(key => typeof key === 'number' ? key : String(key)), message: issue.message })));
}
