import { MAX_AUDIO_BYTES, stagedAudioSchema, type StagedAudio } from 'shared/schemas/audio'
import { inspectPcmWav } from 'shared/audio-container'
export interface PreparedAudio { blob: Blob; analysis: Blob; peaks: number[]; duration: number }
export async function prepareAudio(original: Blob, onValidated?: (mime: string) => Promise<void>): Promise<PreparedAudio> {
  if (!original.size || original.size > MAX_AUDIO_BYTES) throw new Error('Choose an audio file up to 32 MiB.')
  const bytes = await original.arrayBuffer(), signature = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength))
  const wav = signature.length >= 12 && String.fromCharCode(...signature.slice(0, 4)) === 'RIFF' && String.fromCharCode(...signature.slice(8)) === 'WAVE'
  const webm = signature[0] === 0x1a && signature[1] === 0x45 && signature[2] === 0xdf && signature[3] === 0xa3
  if (!wav && !webm) throw new Error('Supported formats: PCM16 WAV and WebM/Opus.')
  if (wav) inspectPcmWav(new Uint8Array(bytes))
  // Preserve original Blob ownership: decodeAudioData may detach only this temporary buffer.
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(bytes)
    if (decoded.duration < 0.025 || decoded.duration > 120 || decoded.numberOfChannels > 2) throw new Error('Audio must be 25 ms–120 seconds, mono or stereo.')
    await onValidated?.(wav ? 'audio/wav' : 'audio/webm')
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) => new Float32Array(decoded.getChannelData(c)))
    const worker = new Worker(new URL('../workers/audio-analysis.worker.ts', import.meta.url), { type: 'module' })
    const result = await new Promise<{ wav: ArrayBuffer; peaks: number[]; duration: number }>((resolve, reject) => {
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Audio processing timed out; try a shorter clip.')) }, 60_000)
      worker.onmessage = event => { clearTimeout(timer); worker.terminate(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data) }
      worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Audio processing failed')) }
      worker.postMessage({ channels, sampleRate: decoded.sampleRate }, channels.map(channel => channel.buffer))
    })
    return { blob: new Blob([original], { type: wav ? 'audio/wav' : 'audio/webm' }), analysis: new Blob([result.wav], { type: 'audio/wav' }), peaks: result.peaks, duration: result.duration }
  } finally { await context.close() }
}
async function upload(url: string, body: Blob, method: string): Promise<StagedAudio> {
  const response = await fetch(url, { method, body, headers: { 'Content-Type': 'application/octet-stream' }, signal: AbortSignal.timeout(30_000) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message ?? result.error ?? 'Audio upload failed. Retry to keep the attachment.')
  return stagedAudioSchema.parse(result)
}
export async function stageAudio(audio: PreparedAudio, stageId?: string) {
  if (stageId) {
    const response = await fetch(`/api/audio/${stageId}/metadata`, { signal: AbortSignal.timeout(30_000) })
    if (response.ok) {
      const retained = stagedAudioSchema.parse(await response.json())
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await audio.blob.arrayBuffer()))
      const originalHash = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
      // Reuse the verified derivative after recovery even if the device's decoding rate changed.
      if (retained.original.sha256 === originalHash && retained.state === 'retained' && retained.analysis) return retained
    } else if (response.status !== 404) throw new Error('Could not recover the staged audio. Retry when the server is available.')
  }
  const initial = await upload('/api/audio/stages', audio.blob, 'POST')
  return upload(`/api/audio/stages/${initial.id}/analysis`, audio.analysis, 'PUT')
}
