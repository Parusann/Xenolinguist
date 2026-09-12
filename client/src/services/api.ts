import type { AIMessage } from 'shared/types'

// Desktop credentials are injected by main; development uses an HttpOnly pairing cookie.
// Never store or expose the session credential to application JavaScript.
const BASE = '/api'

export class ApiError extends Error {
  status: number
  code?: string
  currentRevision?: number
  constructor(message: string, status: number, code?: string, currentRevision?: number) {
    super(message); this.status = status; this.code = code; this.currentRevision = currentRevision
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  new Headers(options?.headers).forEach((value, key) => headers.set(key, value))
  const res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'same-origin',
    signal: options?.signal ?? AbortSignal.timeout(15_000) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(typeof err.error === 'string' ? err.error : err.message || 'API request failed', res.status, err.code, err.currentRevision)
  }
  return res.status === 204 ? undefined as T : res.json()
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
