import { Router } from 'express';
import { AIService } from '../services/ai-service.js';
import type { AIMessage } from '../../../shared/types.js';

export const aiRouter = Router();
const aiService = new AIService();

const VALID_ROLES = new Set(['user', 'assistant', 'system']);

/** Validate the wire shape before handing messages to the Ollama client (which would otherwise
 *  throw an opaque error on a missing/malformed array). */
function isValidMessages(m: unknown): m is AIMessage[] {
  return (
    Array.isArray(m) &&
    m.length > 0 &&
    m.every(
      (x) =>
        x != null &&
        typeof x === 'object' &&
        VALID_ROLES.has((x as { role?: unknown }).role as string) &&
        typeof (x as { content?: unknown }).content === 'string'
    )
  );
}

aiRouter.post('/chat', async (req, res, next) => {
  try {
    const { messages, system, model } = req.body ?? {};
    if (!isValidMessages(messages)) {
      return res.status(400).json({ error: 'messages must be a non-empty array of { role, content }' });
    }
    const result = await aiService.chat(messages, { system, model });
    res.json({ content: result });
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/stream', async (req, res) => {
  const { messages, system, model } = req.body ?? {};
  if (!isValidMessages(messages)) {
    return res.status(400).json({ error: 'messages must be a non-empty array of { role, content }' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    await aiService.stream(messages, { system, model }, (token: string) => {
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    });
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
  }
  res.end();
});
