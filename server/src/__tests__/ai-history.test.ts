import { expect, it } from 'vitest';
import { aiHistorySchema, retainAIHistory, type AIRecord } from '../../../shared/schemas/ai-history.js';
it('bounds message count and total history bytes while retaining partial/error labels', () => {
  const message: AIRecord = { id: '1', role: 'assistant', content: 'x'.repeat(5000), timestamp: new Date().toISOString(), state: 'failed', error: 'stream ended' };
  const retained = retainAIHistory(Array.from({ length: 60 }, (_, i) => ({ ...message, id: String(i) })));
  expect(retained).toHaveLength(24); expect(aiHistorySchema.parse(retained).at(-1)?.state).toBe('failed');
  expect(aiHistorySchema.safeParse([...retained, message]).success).toBe(false);
});
