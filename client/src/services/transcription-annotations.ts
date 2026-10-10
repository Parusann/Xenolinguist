import { transcriptionAnalysisSchema, transcriptionHistorySchema, type TranscriptionAnalysis } from 'shared/schemas/transcription'

export function retainableTranscriptionAnalysis(originalSha256: string, result: unknown): TranscriptionAnalysis {
  const parsed = transcriptionAnalysisSchema.safeParse({ version: 1, id: crypto.randomUUID(), created_at: new Date().toISOString(), originalSha256, result })
  if (!parsed.success) throw new Error('The transcription response has incomplete or inconsistent provenance. Existing annotations are retained; retry analysis.')
  return parsed.data
}
export function retainableTranscriptionHistory(history: TranscriptionAnalysis[]): string {
  const parsed = transcriptionHistorySchema.safeParse(history)
  if (!parsed.success) throw new Error('Transcription history cannot be retained within the eight-analysis / 4 MiB limit. Existing results are preserved.')
  return JSON.stringify(parsed.data)
}
