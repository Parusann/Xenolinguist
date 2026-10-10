import type { AudioClip, AudioSegment } from './types.js';
import { transcriptionHistorySchema, type TranscriptionAnalysis } from './schemas/transcription.js';
import { ProfileError } from './schemas/errors.js';

/** Analysis identities are local to their clip; portable copies retain the original record. */
export function appendTranscriptionAnalysis(clip: AudioClip, analysis: TranscriptionAnalysis): AudioClip {
  const previous = clip.transcriptions ?? [];
  const existing = previous.find(item => item.id === analysis.id);
  if (existing && JSON.stringify(existing) !== JSON.stringify(analysis)) throw new Error('Transcription identity already exists');
  const checked = transcriptionHistorySchema.safeParse(existing ? previous : [...previous, analysis]);
  if (!checked.success) throw new Error('Transcription history is invalid or exceeds eight analyses / 4 MiB. Existing results are preserved.');
  const next = { ...clip, transcriptions: checked.data };
  if (transcriptionAnnotationIssues(next).length) throw new Error('Transcription does not match the recording');
  return next;
}
export function transcriptionAnnotationIssues(clip: AudioClip): string[] {
  const issues: string[] = [];
  for (const analysis of clip.transcriptions ?? []) {
    if (!clip.assets || analysis.originalSha256 !== clip.assets.original.sha256 || analysis.result.audio.sha256 !== clip.assets.analysis.sha256
      || analysis.result.audio.durationSeconds !== clip.duration) issues.push('Transcription must identify the exact original and prepared audio');
  }
  if (clip.manual_source_transcription_id && !clip.transcriptions?.some(a => a.id === clip.manual_source_transcription_id)) issues.push('Manual source analysis is missing');
  if (clip.manual_source_transcription_id && clip.manual_source_analysis_id) issues.push('Manual segments cannot reference two generated sources');
  return issues;
}
export function preserveTranscriptionHistory(next: AudioClip, before?: AudioClip) {
  const old = before?.transcriptions ?? [], history = next.transcriptions ?? [];
  if (old.some((analysis, i) => JSON.stringify(analysis) !== JSON.stringify(history[i])))
    throw new ProfileError('TRANSCRIPTION_HISTORY_IMMUTABLE', 'Saved transcriptions cannot be changed, removed or reordered', 409);
}
/** Deliberate copy into the independent editable layer; no references to generated segment objects. */
export function manualTranscriptionSegments(analysis: TranscriptionAnalysis, newId: () => string): AudioSegment[] {
  return analysis.result.segments.map(s => ({ id: newId(), start: s.start, end: s.end, label: s.text, dictionary_entry_id: null }));
}
