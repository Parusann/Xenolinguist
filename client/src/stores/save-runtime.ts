import { SaveQueue } from './save-queue'
import { createDraftStore } from './draft-store'
import { apiFetch } from '@/services/api'
import type { LanguageProfile } from 'shared/types'

let queue: SaveQueue | undefined
export function getSaveQueue() {
  return queue ??= new SaveQueue({
    get: id => apiFetch<LanguageProfile>(`/profiles/${encodeURIComponent(id)}`),
    mutate: (id, mutation) => apiFetch(`/profiles/${encodeURIComponent(id)}/mutations`, { method: 'POST', body: JSON.stringify(mutation) }),
  }, createDraftStore())
}

interface CloseBridge {
  onFlushRequest?: (callback: (request: unknown) => void) => () => void
  onCloseCancelled?: (callback: () => void) => () => void
  reportFlushResult?: (result: { requestId: string; saved: boolean }) => Promise<void>
}
const desktop = (window as unknown as { xeno?: CloseBridge }).xeno
desktop?.onFlushRequest?.(request => {
  const requestId = (request as { requestId?: unknown })?.requestId
  if (typeof requestId !== 'string') return
  document.documentElement.inert = true
  void getSaveQueue().flush().then(saved => desktop.reportFlushResult?.({ requestId, saved })).catch(() => { document.documentElement.inert = false })
})
desktop?.onCloseCancelled?.(() => { document.documentElement.inert = false })
window.addEventListener('online', () => { if (queue) void queue.flush() })
window.addEventListener('beforeunload', event => {
  if (queue?.pending().some(status => !status.durable)) { event.preventDefault(); event.returnValue = '' }
})
