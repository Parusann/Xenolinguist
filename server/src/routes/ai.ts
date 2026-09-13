import { Router } from 'express';
import { z } from 'zod';
import { AIService, TASK_BUDGETS } from '../services/ai-service.js';
import { jobs } from '../services/job-manager.js';
import { RuntimeError } from '../services/runtime-error.js';

export const aiRouter = Router();
const service = new AIService();
const inputSchema = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().max(20000) })).min(1).max(60),
  system: z.string().max(20000).optional(), model: z.string().min(1).max(200).optional(), task: z.enum(['chat', 'quickSuggest', 'patternAnalysis', 'grammarInference', 'translation', 'conlangGeneration', 'numberAnalysis', 'phoneticAnalysis']).default('chat') });
for (const streaming of [false, true]) aiRouter.post(streaming ? '/stream' : '/chat', async (req, res, next) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid AI request: check messages, model and task limits', code: 'AI_INPUT_INVALID' });
  const input = parsed.data, controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', abort);
  try {
    const job = jobs.submit<string | void>('llm', input.task, signal => streaming
      ? service.stream(input.messages, { ...input, signal }, token => { if (res.writableLength > 1024 * 1024) { controller.abort(); throw new RuntimeError('CLIENT_TOO_SLOW', 'Client stopped reading the stream'); } res.write('data: ' + JSON.stringify({ token }) + '\n\n'); })
      : service.chat(input.messages, { ...input, signal }), { signal: controller.signal, deadlineMs: TASK_BUDGETS[input.task].deadline });
    res.setHeader('X-Xeno-Job', job.id);
    if (streaming) { res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-store'); res.write('data: ' + JSON.stringify({ jobId: job.id }) + '\n\n'); }
    const result = await job.promise;
    if (!res.destroyed) { if (streaming) res.end('data: [DONE]\n\n'); else res.json({ content: result, jobId: job.id }); }
  } catch (error) {
    if (res.destroyed) return;
    if (streaming && res.headersSent) res.end('data: ' + JSON.stringify({ error: error instanceof RuntimeError ? error.message : 'Local model execution failed', code: error instanceof RuntimeError ? error.code : 'AI_FAILED' }) + '\n\n');
    else next(error);
  } finally { res.off('close', abort); }
});
