import type { AudioClip, AudioSegment } from './types.js';
import { phoneHistorySchema, type PhoneAnalysis } from './schemas/phone-analysis.js';
import { ProfileError } from './schemas/errors.js';

/** Analysis identities are local to their clip; portable copies retain the original record. */
export function appendPhoneAnalysis(clip: AudioClip, analysis: PhoneAnalysis): AudioClip {
  const previous = clip.phone_analyses ?? [];
  const existing = previous.find(item => item.id === analysis.id);
  if (existing && JSON.stringify(existing) !== JSON.stringify(analysis)) throw new Error('Phone analysis identity already exists');
  const checked = phoneHistorySchema.safeParse(existing ? previous : [...previous, analysis]);
  if (!checked.success) throw new Error('Phone history is invalid or exceeds eight analyses / 4 MiB. Existing results are preserved.');
  const next = { ...clip, phone_analyses: checked.data };
  if (phoneAnnotationIssues(next).length) throw new Error('Phone analysis does not match the recording');
  return next;
}
export function phoneAnnotationIssues(clip: AudioClip): string[] {
  const issues: string[] = [];
  for (const analysis of clip.phone_analyses ?? []) {
    if (!clip.assets || analysis.originalSha256 !== clip.assets.original.sha256 || analysis.result.audio.sha256 !== clip.assets.analysis.sha256
      || analysis.result.audio.durationSeconds !== clip.duration) issues.push('Phone analysis must identify the exact original and prepared audio');
  }
  if (clip.manual_source_analysis_id && !clip.phone_analyses?.some(a => a.id === clip.manual_source_analysis_id)) issues.push('Manual source analysis is missing');
  return issues;
}
export function preservePhoneHistory(next: AudioClip, before?: AudioClip) {
  const old = before?.phone_analyses ?? [], history = next.phone_analyses ?? [];
  if (old.some((analysis, i) => JSON.stringify(analysis) !== JSON.stringify(history[i])))
    throw new ProfileError('PHONE_HISTORY_IMMUTABLE', 'Saved phone analyses cannot be changed, removed or reordered', 409);
}
/** Deliberate copy into the independent editable layer; no references to generated segment objects. */
export function manualPhoneSegments(analysis: PhoneAnalysis, newId: () => string): AudioSegment[] {
  return analysis.result.segments.map(s => ({ id: newId(), start: s.start, end: s.end, label: s.phone, dictionary_entry_id: null }));
}
