import { phoneAnalysisSchema, phoneHistorySchema, type PhoneAnalysis } from 'shared/schemas/phone-analysis'

export function retainablePhoneAnalysis(originalSha256: string, result: unknown): PhoneAnalysis {
  const parsed = phoneAnalysisSchema.safeParse({ version: 1, id: crypto.randomUUID(), created_at: new Date().toISOString(), originalSha256, result })
  if (!parsed.success) throw new Error('The phone response has incomplete or inconsistent provenance. Existing annotations are retained; retry analysis.')
  return parsed.data
}
export function retainablePhoneHistory(history: PhoneAnalysis[]): string {
  const parsed = phoneHistorySchema.safeParse(history)
  if (!parsed.success) throw new Error('Phone history cannot be retained within the eight-analysis / 4 MiB limit. Existing results are preserved.')
  return JSON.stringify(parsed.data)
}
