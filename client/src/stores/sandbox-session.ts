import { getSaveQueue } from './save-runtime'
import { createSandboxSession, applySandboxAction, type SandboxAction } from 'shared/sandbox/session'
import type { SandboxDifficulty } from 'shared/types'

export function startSandbox(profileId: string, data: unknown, difficulty: SandboxDifficulty, model: string) {
  const queue = getSaveQueue(), profile = queue.view(profileId)
  if (!profile) throw new Error('Profile is no longer loaded')
  const session = createSandboxSession(data, crypto.randomUUID(), new Date().toISOString(), model)
  queue.edit(profile, { ...profile, sandbox_difficulty: difficulty, sandbox_session: session })
}
export function dispatchSandbox(profileId: string, sessionId: string, action: SandboxAction) {
  const queue = getSaveQueue(), profile = queue.view(profileId)
  if (profile) queue.edit(profile, applySandboxAction(profile, sessionId, action, crypto.randomUUID(), new Date().toISOString()))
}
export function resetSandbox(profileId: string) {
  const queue = getSaveQueue(), profile = queue.view(profileId)
  if (profile) queue.edit(profile, { ...profile, sandbox_session: null })
}
