import { getSaveQueue } from './save-runtime'
import { retainAIHistory, type AIRecord } from 'shared/schemas/ai-history'

/** Update only the originating profile, including when the user changes workspaces mid-stream. */
export function saveAIRecords(profileId: string, records: AIRecord[]) {
  const queue = getSaveQueue(), profile = queue.view(profileId)
  if (!profile) return
  const ids = new Set(records.map(record => record.id))
  const ai_history = retainAIHistory([...(profile.ai_history ?? []).filter(record => !ids.has(record.id)), ...records])
  queue.edit(profile, { ...profile, ai_history })
}
