import type { AIMessage } from 'shared/types'

const BASE = '/api'

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'API request failed')
  }
  return res.json()
}

export async function streamAI(
  messages: AIMessage[],
  options: { system?: string; model?: string; signal?: AbortSignal },
  onToken: (token: string) => void,
): Promise<void> {
  const { signal, ...opts } = options
  const res = await fetch(`${BASE}/ai/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, ...opts }),
    signal,
  })

  // Surface a non-2xx (e.g. a 400 validation error) instead of trying to read an error body as a stream.
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `AI request failed (${res.status})`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response stream')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') return
      // Only JSON.parse is allowed to fail silently (partial/malformed frame).
      // A server-emitted { error } must propagate — keep it OUT of this guard,
      // otherwise real backend errors (Ollama down, model missing) vanish.
      let parsed: { error?: string; token?: string }
      try {
        parsed = JSON.parse(data)
      } catch {
        continue
      }
      if (parsed.error) throw new Error(parsed.error)
      if (parsed.token) onToken(parsed.token)
    }
  }
}
