import { z } from 'zod';

export const modelSchema = z.object({ name: z.string(), digest: z.string(), size: z.number(), capabilities: z.array(z.string()),
  location: z.enum(['local', 'remote', 'unknown']), eligible: z.boolean(), reason: z.string(), remoteHost: z.string().optional(), remoteModel: z.string().optional() });
export type ModelCapability = z.infer<typeof modelSchema>;
export interface Capability { state: 'available' | 'unavailable' | 'unknown'; detail: string; }
export interface RuntimeCapabilities {
  checkedAt: string; expiresAt: string;
  storage: Capability; tts: Capability; stt: Capability; phones: Capability; chat: Capability;
  resources: { cpuCount: number; freeMemoryBytes: number; totalMemoryBytes: number };
}
export interface ModelInventory { connected: boolean; ready: boolean; models: string[]; inventory: ModelCapability[]; checkedAt: string; expiresAt: string; error?: string; defaultModel: string; }
export type JobLane = 'llm' | 'acoustic' | 'download';
export interface JobRecord { id: string; lane: JobLane; task: string; state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; createdAt: string; startedAt?: string; finishedAt?: string; cancelRequested?: boolean; error?: string; progress?: { status: string; completed?: number; total?: number }; }
