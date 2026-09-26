import { checkSuppliedTarget } from '../../../engine/src/evidence/tests.js';
import { derive } from '../../../engine/src/translation/derive.js';
import { canonical, translationDependencies, dependency } from '../../../engine/src/evidence/dependencies.js';
import { evidenceCounts } from '../../../engine/src/evidence/scores.js';
import { createHash } from 'node:crypto';
import type { LanguageProfile } from '../../../shared/types.js';
import { assertResearchAppendOnly } from '../../../shared/schemas/research.js';
import { ProfileError } from '../../../shared/schemas/errors.js';
import { dictionaryEntrySchema, grammarRuleSchema } from '../../../shared/schemas/profile.js';
import { lexicalPolicySchema } from '../../../shared/schemas/lexicon.js';

export function verifyResearch(profile: LanguageProfile, previous?: LanguageProfile) {
  try { if (previous) assertResearchAppendOnly(previous.research, profile.research); }
  catch (error) { throw new ProfileError('RESEARCH_IMMUTABLE', (error as Error).message, 409); }
  // Historical imports are replayed against their retained input inventories, not today's edited workspace.
  for (const run of profile.research.analyses.filter(a => !previous?.research.analyses.some(old => old.id === a.id))) {
    try {
      const snapshots = new Map(run.dependencies.map(d => [d.kind, JSON.parse(d.snapshot) as unknown]));
      if (run.dependencies.length !== 4 || snapshots.size !== 4 || !['lexicon', 'grammar', 'policy', 'evidence'].every(k => snapshots.has(k as 'lexicon')))
        throw new Error('Missing analysis input snapshot');
      const input = { dictionary: dictionaryEntrySchema.array().parse(snapshots.get('lexicon')),
        grammar_rules: grammarRuleSchema.array().parse(snapshots.get('grammar')),
        lexical_policy: snapshots.get('policy') === null ? undefined : lexicalPolicySchema.parse(snapshots.get('policy')) };
      if (canonical(derive(run.source, input)) !== canonical(run.result)) throw new Error('Retained derivation does not replay');
    } catch {
      throw new ProfileError('RESEARCH_REPLAY_FAILED', 'A retained derivation failed validation or exact replay against its input snapshots', 422);
    }
  }
  if (previous) {
    for (const run of profile.research.analyses.filter(a => !previous.research.analyses.some(old => old.id === a.id))) {
      if (run.profile_revision !== previous.revision || canonical(run.dependencies) !== canonical(translationDependencies(profile)) || canonical(run.result) !== canonical(derive(run.source, profile)))
        throw new ProfileError('RESEARCH_ANALYSIS_STALE', 'Analysis inputs changed or the supplied result failed deterministic verification. Recompute before saving.', 409);
    }
    for (const metric of profile.research.metrics.filter(a => !previous.research.metrics.some(old => old.id === a.id))) {
      const counts = evidenceCounts(profile, metric.hypothesis_id);
      if (metric.profile_revision !== previous.revision || canonical(metric.dependencies) !== canonical([dependency(profile, 'hypothesis', metric.hypothesis_id)]) || ['supports', 'contradicts', 'ambiguous'].some(key => metric[key as 'supports'] !== counts[key as 'supports']))
        throw new ProfileError('RESEARCH_METRIC_STALE', 'Evidence counts changed. Recompute before saving.', 409);
    }
  }
  for (const test of profile.research.tests) {
    const run = profile.research.analyses.find(a => a.id === test.analysis_id)!;
    if (test.outcome !== checkSuppliedTarget(run, test.expected)) throw new ProfileError('RESEARCH_TEST_MISMATCH', 'Supplied target check does not match its retained derivation', 422);
  }
  for (const o of profile.research.observations) {
    if (createHash('sha256').update(o.text).digest('hex') !== o.content_sha256)
      throw new ProfileError('RESEARCH_HASH_MISMATCH', 'Captured observation text failed its SHA-256 check', 422);
    if (o.audio) {
      const clip = profile.audio_clips.find(c => c.id === o.audio!.clip_id);
      if (!clip?.assets || clip.assets.original.sha256 !== o.audio.asset_sha256 || o.audio.end > clip.duration)
        throw new ProfileError('RESEARCH_AUDIO_MISSING', 'A captured audio span requires its original recording. Withdraw the observation to exclude it from analyses; keep the recording for its audit trail.', 422);
    }
  }
}
