import { z } from 'zod';
export const aiRecordSchema = z.object({ id: z.string().min(1).max(100), role: z.enum(['user', 'assistant']), content: z.string().max(60000),
  timestamp: z.string().datetime(), model: z.string().max(200).optional(), task: z.string().max(100).optional(),
  state: z.enum(['complete', 'partial', 'cancelled', 'failed']), error: z.string().max(500).optional() });
export type AIRecord = z.infer<typeof aiRecordSchema>;
export const aiHistorySchema = z.array(aiRecordSchema).max(40).refine(records => records.reduce((n, record) => n + record.content.length, 0) <= 120000, 'AI history exceeds retention limit');
export function retainAIHistory(records: AIRecord[]) {
  const retained = records.slice(-40).map(record => ({ ...record, content: record.content.slice(0, 60000) }));
  while (retained.reduce((n, record) => n + record.content.length, 0) > 120000) retained.shift();
  return retained;
}
