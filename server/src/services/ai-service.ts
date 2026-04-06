import { Ollama } from 'ollama';
import type { AIMessage } from '../../../shared/types.ts';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

export class AIService {
  private ollama: Ollama;
  private defaultModel = 'qwen3:14b';

  constructor() {
    this.ollama = new Ollama({ host: OLLAMA_BASE_URL });
  }

  async chat(
    messages: AIMessage[],
    options: { system?: string; model?: string } = {}
  ): Promise<string> {
    const allMessages = options.system
      ? [{ role: 'system' as const, content: options.system }, ...messages]
      : messages;

    const response = await this.ollama.chat({
      model: options.model || this.defaultModel,
      messages: allMessages,
      stream: false,
    });

    return response.message.content;
  }

  async stream(
    messages: AIMessage[],
    options: { system?: string; model?: string } = {},
    onToken: (token: string) => void
  ): Promise<void> {
    const allMessages = options.system
      ? [{ role: 'system' as const, content: options.system }, ...messages]
      : messages;

    const response = await this.ollama.chat({
      model: options.model || this.defaultModel,
      messages: allMessages,
      stream: true,
    });

    for await (const chunk of response) {
      if (chunk.message?.content) {
        onToken(chunk.message.content);
      }
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await this.ollama.list();
      return response.models.map(m => m.name);
    } catch {
      return [];
    }
  }
}
