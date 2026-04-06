import { Router } from 'express';
import { AIService } from '../services/ai-service.js';

export const aiRouter = Router();
const aiService = new AIService();

aiRouter.post('/chat', async (req, res, next) => {
  try {
    const { messages, system, model } = req.body;
    const result = await aiService.chat(messages, { system, model });
    res.json({ content: result });
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/stream', async (req, res) => {
  const { messages, system, model } = req.body;

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
