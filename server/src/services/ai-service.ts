import { Ollama } from 'ollama';
import type { AIMessage } from '../../../shared/types.ts';
import { defaultModel, ollamaBaseUrl } from '../config.js';

/** Per-request timeout for Ollama calls. For streams it is the maximum gap between
 *  tokens (re-armed on each chunk), so a hung/slow model can't block a request forever.
 *  Overridable via OLLAMA_TIMEOUT_MS. */
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120_000;

export class AIService {
  public readonly model: string;
  private readonly host: string;

  constructor() {
    this.host = ollamaBaseUrl();
    this.model = defaultModel();
  }

  private withSystem(messages: AIMessage[], system?: string): AIMessage[] {
    return system ? [{ role: 'system' as const, content: system }, ...messages] : messages;
  }

  async chat(
    messages: AIMessage[],
    options: { system?: string; model?: string } = {}
  ): Promise<string> {
    // A fresh client per call so abort() (on timeout) only affects this request.
    const client = new Ollama({ host: this.host });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; client.abort(); }, OLLAMA_TIMEOUT_MS);
    try {
      const response = await client.chat({
        model: options.model || this.model,
        messages: this.withSystem(messages, options.system),
        stream: false,
      });
      return response.message.content;
    } catch (err) {
      if (timedOut) throw new Error('Ollama request timed out');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async stream(
    messages: AIMessage[],
    options: { system?: string; model?: string } = {},
    onToken: (token: string) => void
  ): Promise<void> {
    const client = new Ollama({ host: this.host });
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { timedOut = true; client.abort(); }, OLLAMA_TIMEOUT_MS);
    };
    arm();
    try {
      const response = await client.chat({
        model: options.model || this.model,
        messages: this.withSystem(messages, options.system),
        stream: true,
      });
      for await (const chunk of response) {
        arm(); // reset the watchdog on every token
        if (chunk.message?.content) onToken(chunk.message.content);
      }
    } catch (err) {
      if (timedOut) throw new Error('Ollama stream timed out');
      throw err;
    } finally {
      clearTimeout(timer!);
    }
  }
}
