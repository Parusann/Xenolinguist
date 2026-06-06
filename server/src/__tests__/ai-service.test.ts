import { describe, it, expect, afterEach } from 'vitest';

afterEach(() => { delete process.env.OLLAMA_MODEL; });

describe('AIService default model', () => {
  it('defaults to gemma4:e4b', async () => {
    const { AIService } = await import('../services/ai-service.js?ai=1');
    expect(new AIService().model).toBe('gemma4:e4b');
  });

  it('honors OLLAMA_MODEL', async () => {
    process.env.OLLAMA_MODEL = 'llama3.1:8b';
    const { AIService } = await import('../services/ai-service.js?ai=2');
    expect(new AIService().model).toBe('llama3.1:8b');
  });
});
