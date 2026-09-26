import { createHash } from 'node:crypto';
import type { LanguageProfile } from '../../../shared/types.js';
import type { ProposalReview } from '../../../shared/schemas/proposal-reviews.js';
import { REVIEW_LIMITS } from '../../../shared/schemas/proposal-reviews.js';
import { proposalRunSchema } from '../../../shared/schemas/proposals.js';
import { parseProfile } from '../../../shared/schemas/profile.js';
import { ProfileError } from '../../../shared/schemas/errors.js';
import { canonical } from '../../../engine/src/evidence/dependencies.js';
import { validateProposal } from './proposal-validator.js';
import { verifyResearch } from './research-integrity.js';
import { createHypothesisTools } from './tools/registry.js';

export const reviewHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function reviewSource(record: ProposalReview) {
  const raw = JSON.parse(record.source_json);
  if (raw.proposal_reviews !== undefined) throw new Error('Nested proposal history is not allowed');
  return parseProfile(raw);
}
export const reviewRun = (record: ProposalReview) => record.run_json ? proposalRunSchema.parse(JSON.parse(record.run_json)) : null;
export function verifyProposalReviews(profile: LanguageProfile, previous?: LanguageProfile) {
  const records = profile.proposal_reviews ?? [];
  if (Buffer.byteLength(JSON.stringify(records)) > REVIEW_LIMITS.totalBytes || Buffer.byteLength(JSON.stringify(profile)) > 10 * 1024 * 1024)
    throw new ProfileError('PROPOSAL_HISTORY_LIMIT', 'Proposal history is full; preserve a project archive before starting another project', 413);
  for (const r of records) {
    if (previous?.proposal_reviews?.some(old => canonical(old) === canonical(r))) continue;
    try {
      if (reviewHash(r.source_json) !== r.source_sha256 || (r.run_json && reviewHash(r.run_json) !== r.run_sha256)) throw new Error('Hash mismatch');
      const source = reviewSource(r), run = reviewRun(r);
      verifyResearch(source);
      if (source.id !== r.request.profile_id || source.revision !== r.request.expectedRevision) throw new Error('Source identity mismatch');
      if (run) {
        if (run.provenance.profile_id !== source.id || run.provenance.profile_revision !== source.revision || run.provenance.model !== r.request.model ||
          run.provenance.query !== r.request.query || canonical(run.provenance.validation_sample_ids) !== canonical(r.request.validation_sample_ids)) throw new Error('Provenance mismatch');
        const validation = validateProposal(source, run.proposal, r.request.validation_sample_ids);
        if (canonical(validation) !== canonical(run.validation) || validation.input_sha256 !== run.provenance.input_sha256) throw new Error('Result mismatch');
        const tools = createHypothesisTools(source, r.request.validation_sample_ids, new AbortController().signal);
        for (const call of run.provenance.tool_calls) if (canonical(tools.execute(call.action)) !== canonical(call.result)) throw new Error('Tool result mismatch');
        if (r.decision) {
          if (r.decision.digest !== reviewHash(canonical({ reviewId: r.id, action: r.decision.action, reason: r.decision.reason })) || r.decision.applied_revision > profile.revision)
            throw new Error('Decision identity mismatch');
          if (r.decision.action === 'accept') {
            if (!['compatible', 'request'].includes(validation.status)) throw new Error('Unsupported acceptance');
            if (run.proposal.content.kind !== 'observation-request') {
              const hypothesis = profile.research.hypotheses.find(h => h.id === r.decision!.hypothesis_id);
              if (!hypothesis || hypothesis.provenance !== 'model' || !profile.research.events.some(e => e.kind === 'hypothesis-status' && e.hypothesis_id === hypothesis.id && e.status === 'accepted')) throw new Error('Accepted hypothesis missing');
            }
          }
        }
      }
    } catch { throw new ProfileError('PROPOSAL_REPLAY_FAILED', 'A retained proposal failed source, provenance or deterministic result verification', 422); }
  }
}
