import { BrowserWindow } from 'electron';

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';

export async function isOllamaUp(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function hasModel(model = DEFAULT_MODEL): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).some((m) => m.name === model || m.name.startsWith(`${model}`));
  } catch {
    return false;
  }
}

/** Pull the default model, streaming progress to the renderer. Best-effort. */
export async function pullDefaultModel(win: BrowserWindow, model = DEFAULT_MODEL): Promise<void> {
  const res = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split('\n')) {
      if (!line.trim()) continue;
      try {
        const status = JSON.parse(line);
        win.webContents.send('ollama:pull-progress', status);
      } catch { /* ignore partial lines */ }
    }
  }
}
