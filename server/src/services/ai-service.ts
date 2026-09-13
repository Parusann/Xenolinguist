import type { AIMessage, AITask } from '../../../shared/types.ts';
import { defaultModel } from '../config.js';
import { requireLocalModel, localOllamaUrl } from './ollama-runtime.js';
import { readNdjson } from './ndjson.js';
import { RuntimeError } from './runtime-error.js';

export const TASK_BUDGETS: Record<AITask | 'chat', { context: number; output: number; chars: number; deadline: number }> = {
  chat: { context: 8192, output: 2048, chars: 20000, deadline: 180000 },
  quickSuggest: { context: 4096, output: 512, chars: 10000, deadline: 90000 },
  patternAnalysis: { context: 8192, output: 2048, chars: 20000, deadline: 180000 },
  grammarInference: { context: 8192, output: 2048, chars: 20000, deadline: 180000 },
  translation: { context: 8192, output: 2048, chars: 20000, deadline: 180000 },
  conlangGeneration: { context: 8192, output: 4096, chars: 12000, deadline: 240000 },
  numberAnalysis: { context: 4096, output: 1024, chars: 10000, deadline: 120000 },
  phoneticAnalysis: { context: 4096, output: 1024, chars: 10000, deadline: 120000 },
};
export interface AIOptions { system?: string; model?: string; task?: keyof typeof TASK_BUDGETS; signal?: AbortSignal; }
export class AIService {
  public readonly model = defaultModel();
  async chat(messages: AIMessage[], options: AIOptions = {}): Promise<string> {
    let content = ''; await this.stream(messages, options, token => { content += token; }); return content;
  }
  async stream(messages: AIMessage[], options: AIOptions = {}, onToken: (token: string) => void): Promise<void> {
    const budget = TASK_BUDGETS[options.task ?? 'chat'];
    const signal = AbortSignal.any([AbortSignal.timeout(budget.deadline), ...(options.signal ? [options.signal] : [])]);
    const model = await requireLocalModel(options.model || this.model, signal);
    const input = options.system ? [{ role: 'system' as const, content: options.system }, ...messages] : messages;
    if (input.reduce((n, m) => n + m.content.length, 0) > budget.chars) throw new RuntimeError('CONTEXT_LIMIT', 'Context exceeds the task limit. Shorten the input or clear older chat messages.', 413);
    const response = await fetch(localOllamaUrl() + '/api/chat', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ model: model.name, messages: input, stream: true, think: false, keep_alive: '2m', truncate: false,
        options: { num_ctx: budget.context, num_predict: budget.output, temperature: 0.2, seed: 42 } }) });
    let done = false, chars = 0;
    await readNdjson(response, chunk => {
      if (chunk.remote_host || chunk.remote_model) throw new RuntimeError('MODEL_NOT_LOCAL_CHAT', 'Remote model output was rejected', 422);
      if (done) throw new RuntimeError('STREAM_INVALID', 'Model sent data after completion');
      const text = chunk.message?.content;
      if (typeof text === 'string') { chars += text.length; if (chars > 60000) throw new RuntimeError('OUTPUT_LIMIT', 'Model output exceeded its limit', 413); onToken(text); }
      if (chunk.done === true) { if (chunk.done_reason === 'length') throw new RuntimeError('OUTPUT_LIMIT', 'Model reached the output budget; the partial answer is retained', 413); done = true; }
    }, signal, 45000);
    if (!done) throw new RuntimeError('STREAM_INCOMPLETE', 'Model connection ended before completion');
  }
}
