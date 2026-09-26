import { randomUUID } from 'node:crypto';
import type { LanguageProfile } from '../../../shared/types.js';
import { proposalRequestSchema, PROPOSAL_LIMITS } from '../../../shared/schemas/proposals.js';
import { proposalDecisionInputSchema, proposalReviewSchema, REVIEW_LIMITS, type ProposalReview, type ProposalReviewState } from '../../../shared/schemas/proposal-reviews.js';
import { ProfileError } from '../../../shared/schemas/errors.js';
import { canonical } from '../../../engine/src/evidence/dependencies.js';
import { proposalInputHash, proposalPreview, validateProposal } from './proposal-validator.js';
import { reviewHash, reviewRun, reviewSource } from './proposal-review-integrity.js';
import { ProfileStore } from './profile-store.js';
import { runResearchProposal } from './research-proposal.js';
import { jobs, type JobManager } from './job-manager.js';
import { RuntimeError } from './runtime-error.js';
import { derive } from '../../../engine/src/translation/derive.js';
import type { ResearchProposal } from '../../../shared/schemas/proposals.js';

const active = new Set<string>();
function exercised(profile: LanguageProfile, proposal: ResearchProposal, sampleIds: string[]) {
  const content = proposal.content;
  if (content.kind === 'observation-request') return true;
  const preview = proposalPreview(profile, proposal);
  const target = content.kind === 'lexical' ? content.entry_id ?? preview.dictionary.find(w => !profile.dictionary.some(old => old.id === w.id))?.id
    : content.rule_id ?? preview.grammar_rules.find(r => !profile.grammar_rules.some(old => old.id === r.id))?.id;
  return Boolean(target && sampleIds.some(id => {
    const sample = profile.samples.find(s => s.id === id);
    if (!sample) return false;
    const result = derive(sample.alien_text, preview);
    return result.status === 'resolved' && result.candidates.some(c => content.kind === 'lexical' ? c.steps.some(s => s.entryId === target) : c.ruleIds.includes(target));
  }));
}
export function proposalReviewState(profile: LanguageProfile, record: ProposalReview): ProposalReviewState {
  const source = reviewSource(record), run = reviewRun(record);
  // Saving a review itself advances the profile revision, but is not a change to linguistic inputs.
  const current = { ...profile, revision: source.revision };
  const stale = Boolean(record.archived) || profile.id !== source.id || proposalInputHash(current, record.request.validation_sample_ids) !== proposalInputHash(source, record.request.validation_sample_ids);
  const tested = Boolean(run && ['compatible', 'request'].includes(run.validation.status));
  const relevant = Boolean(run && tested && !stale && exercised(current, run.proposal, record.request.validation_sample_ids));
  return { id: record.id, status: record.status === 'running' && !active.has(record.id) ? 'interrupted' : record.status,
    stale, canAccept: record.status === 'completed' && !record.decision && !stale && tested && relevant,
    acceptBlockReason: stale ? 'Inputs changed or this review was restored.' : !tested ? 'A compatible tested proposal or observation request is required.'
      : !relevant ? 'No selected test exercises the proposed entry or rule. Generate a new run with a relevant target.' : null };
}
export class ProposalReviews {
  constructor(private readonly profiles = new ProfileStore(), private readonly generate = runResearchProposal, private readonly queue: JobManager = jobs) {}
  async list(profileId: string) {
    const profile = await this.profiles.get(profileId);
    if (!profile) throw new ProfileError('PROFILE_MISSING', 'Project not found', 404);
    return { profile, states: (profile.proposal_reviews ?? []).map(r => proposalReviewState(profile, r)) };
  }
  async create(input: unknown, signal: AbortSignal) {
    const request = proposalRequestSchema.parse(input), id = randomUUID();
    active.add(id);
    let begun = false;
    try {
      signal.throwIfAborted();
      const started = await this.profiles.commitProposalReview(request.profile_id, request.expectedRevision, current => {
        if ((current.proposal_reviews?.length ?? 0) >= REVIEW_LIMITS.records) throw new ProfileError('PROPOSAL_HISTORY_LIMIT', 'This project has reached its 20-record proposal history limit', 413);
        // Never nest history or copy unrelated private chat/compiler data into a run's input snapshot.
        const { proposal_reviews: _reviews, ai_history: _chat, metric_snapshots: _metrics, compiler_session_id: _compiler, sandbox_session: _sandbox, ...source } = current;
        const source_json = JSON.stringify(source);
        const record = proposalReviewSchema.parse({ id, created_at: new Date().toISOString(), request, source_json,
          source_sha256: reviewHash(source_json), status: 'running', run_json: null, run_sha256: null, error: null, decision: null });
        return { ...current, proposal_reviews: [...(current.proposal_reviews ?? []), record] };
      });
      begun = true;
      const snapshot = reviewSource(started.proposal_reviews!.find(r => r.id === id)!);
      const job = this.queue.submit('llm', 'researchReview', async jobSignal => {
        const run = await this.generate(snapshot, request, jobSignal);
        jobSignal.throwIfAborted();
        const run_json = JSON.stringify(run);
        return this.finish(request.profile_id, id, { status: 'completed', run_json, run_sha256: reviewHash(run_json), error: null });
      }, { signal, deadlineMs: PROPOSAL_LIMITS.deadlineMs });
      return { profile: await job.promise, reviewId: id, jobId: job.id };
    } catch (error) {
      if (begun) await this.finish(request.profile_id, id, { status: signal.aborted || (error as { code?: string }).code === 'JOB_CANCELLED' ? 'cancelled' : 'failed',
        error: { code: error instanceof RuntimeError || error instanceof ProfileError ? error.code : signal.aborted ? 'JOB_CANCELLED' : 'PROPOSAL_FAILED',
          message: (error instanceof RuntimeError || error instanceof ProfileError ? error.message : signal.aborted ? 'Proposal generation cancelled' : 'Proposal generation failed').slice(0, 500) } }).catch(() => {
        // Preserve the original pending record; list() reports it as interrupted once execution leaves active.
        console.error('[proposal-review] Could not record completion; the pending review remains recoverable');
      });
      throw error;
    } finally { active.delete(id); }
  }
  private async finish(profileId: string, id: string, patch: Partial<ProposalReview>) {
    return this.profiles.commitProposalReview(profileId, undefined, current => {
      const old = current.proposal_reviews?.find(r => r.id === id);
      if (!old || old.status !== 'running') return null;
      return { ...current, proposal_reviews: current.proposal_reviews!.map(r => r.id === id ? { ...r, ...patch } : r) };
    });
  }
  async decide(profileId: string, reviewId: string, input: unknown) {
    const decision = proposalDecisionInputSchema.parse(input);
    const digest = reviewHash(canonical({ reviewId, action: decision.action, reason: decision.reason }));
    return this.profiles.commitProposalReview(profileId, decision.expectedRevision, current => {
      const record = current.proposal_reviews?.find(r => r.id === reviewId);
      if (!record) throw new ProfileError('PROPOSAL_MISSING', 'Proposal review not found in this project', 404);
      const reused = current.proposal_reviews?.find(r => r.decision?.mutation_id === decision.mutationId)?.decision;
      const ledger = current.recent_mutations.find(m => m.id === decision.mutationId);
      if ((reused && reused.digest !== digest) || (ledger && ledger.digest !== digest)) throw new ProfileError('MUTATION_ID_REUSED', 'Decision identifier already used', 409);
      if (record.decision) {
        if (record.decision.mutation_id === decision.mutationId && record.decision.digest === digest) return null;
        throw new ProfileError('PROPOSAL_DECIDED', 'This proposal already has a recorded decision', 409);
      }
      const run = reviewRun(record);
      if (!run || record.status !== 'completed') throw new ProfileError('PROPOSAL_INCOMPLETE', 'Only a completed proposal can be reviewed', 409);
      let next = structuredClone(current), hypothesis_id: string | null = null, target_id: string | null = null;
      const created_at = new Date().toISOString();
      if (decision.action === 'accept') {
        const state = proposalReviewState(current, record);
        if (state.stale) throw new ProfileError('PROPOSAL_STALE', 'Proposal inputs changed or were restored. Generate a new proposal before accepting.', 409);
        const validation = validateProposal({ ...current, revision: run.proposal.scope.revision }, run.proposal, record.request.validation_sample_ids);
        if (!['compatible', 'request'].includes(validation.status)) throw new ProfileError('PROPOSAL_NOT_SUPPORTED', 'Falsified, invalid or inconclusive proposals cannot be applied', 422);
        if (!exercised(current, run.proposal, record.request.validation_sample_ids)) throw new ProfileError('PROPOSAL_NOT_EXERCISED', 'No selected test exercises the proposed entry or rule', 422);
        const content = run.proposal.content;
        if (content.kind !== 'observation-request') {
          target_id = (content.kind === 'lexical' ? content.entry_id : content.rule_id) ?? randomUUID();
          const bound = { ...run.proposal, content: content.kind === 'lexical' ? { ...content, entry_id: target_id } : { ...content, rule_id: target_id } };
          const preview = proposalPreview(current, bound);
          next.dictionary = preview.dictionary; next.grammar_rules = preview.grammar_rules;
          hypothesis_id = randomUUID();
          next.research.hypotheses.push({ id: hypothesis_id, created_at, label: run.proposal.label, provenance: 'model',
            content: content.kind === 'lexical' ? { kind: 'lexical', entry_id: target_id, form: content.form, meaning: content.meaning }
              : { kind: 'grammar', rule_id: target_id, rule: content.rule },
            manual_belief: null, score_definition: 'evidence-counts-1', supersedes: null });
          next.research.links.push(...run.proposal.citations.map(c => ({ id: randomUUID(), created_at, hypothesis_id: hypothesis_id!,
            observation_id: c.observation_id, annotation_id: c.annotation_id, relation: c.relation,
            span: { start: c.start, end: c.end }, note: `Model-proposed evidence relation; reviewed by the user. Proposal ${record.id}.` })));
          next.research.events.push({ id: randomUUID(), created_at, kind: 'hypothesis-status', hypothesis_id,
            status: 'accepted', reason: decision.reason });
        }
      }
      const accepted = { action: decision.action, reason: decision.reason, created_at, mutation_id: decision.mutationId,
        digest, applied_revision: current.revision + 1, hypothesis_id, target_id };
      next.proposal_reviews = current.proposal_reviews!.map(r => r.id === reviewId ? { ...r, decision: accepted } : r);
      next.recent_mutations = [...current.recent_mutations, { id: decision.mutationId, digest, revision: current.revision + 1 }].slice(-128);
      return next;
    });
  }
  async remove(profileId: string, reviewId: string, expectedRevision: number) {
    return this.profiles.commitProposalReview(profileId, expectedRevision, current => {
      const record = current.proposal_reviews?.find(r => r.id === reviewId);
      if (!record) return null;
      if (active.has(reviewId) || record.decision?.action === 'accept') throw new ProfileError('PROPOSAL_RETAINED', 'Running and accepted proposal records must be retained', 409);
      return { ...current, proposal_reviews: current.proposal_reviews!.filter(r => r.id !== reviewId) };
    });
  }
}
