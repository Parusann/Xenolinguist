import { randomUUID } from 'node:crypto';
import { ProfileStore } from './profile-store.js';
import { ProfileError } from '../../../shared/schemas/errors.js';
import { elicitationDecisionSchema } from '../../../shared/schemas/elicitation-records.js';
import { grammarQuestionSchema } from '../../../shared/schemas/grammar-elicitation.js';
import { grammarContext, grammarSessionReport } from '../../../engine/src/elicitation/grammar-session.js';
import { stableKey } from '../../../engine/src/elicitation/contracts.js';
import { elicitationHash } from './elicitation-integrity.js';
import { grammarEvidence, grammarInputHash, grammarReport, grammarSource, grammarState } from './grammar-elicitation-integrity.js';

export class GrammarElicitationSessions {
  constructor(private readonly profiles = new ProfileStore()) {}
  async list(id: string) {
    const profile = await this.profiles.get(id);
    if (!profile) throw new ProfileError('PROFILE_MISSING', 'Project not found', 404);
    return { profile, states: (profile.grammar_elicitation_history ?? []).map(r => grammarState(profile, r)) };
  }
  async create(id: string, raw: unknown) {
    const request = grammarQuestionSchema.parse(raw), request_sha256 = elicitationHash(stableKey(request.setup));
    return this.profiles.commitResearchRecord(id, request.expectedRevision, current => {
      const history = current.grammar_elicitation_history ?? [], receipt = history.find(r => r.request_id === request.mutationId);
      if (receipt) {
        if (receipt.request_sha256 !== request_sha256) throw new ProfileError('MUTATION_ID_REUSED', 'Question identifier already used for different grounding', 409);
        return null;
      }
      if (history.some(r => r.decision?.mutation_id === request.mutationId) || current.recent_mutations.some(m => m.id === request.mutationId)) throw new ProfileError('MUTATION_ID_REUSED', 'Request identifier already used', 409);
      if (history.length >= 20) throw new ProfileError('ELICITATION_HISTORY_LIMIT', 'Grammar history has reached 20 records. Export before starting a new research project.', 413);
      let context;
      try { context = grammarContext(current, request.setup); }
      catch (e) { throw new ProfileError('GRAMMAR_GROUNDING_INVALID', (e as Error).message, 422); }
      const context_sha256 = elicitationHash(stableKey(context)), evidence = grammarEvidence(current, context_sha256), input_sha256 = grammarInputHash(context, evidence);
      const declined = history.filter(r => !r.archived && r.input_sha256 === input_sha256 && r.decision?.action === 'decline').map(r => grammarReport(r).selection!.meaning!);
      const source = { profile_id: current.id, profile_revision: current.revision, setup: request.setup, context, evidence, declined };
      const report = grammarSessionReport(source);
      if (report.status === 'invalid') throw new ProfileError('GRAMMAR_GROUNDING_INVALID', report.reason, 422);
      const source_json = JSON.stringify(source), report_json = JSON.stringify(report);
      return { ...current, grammar_elicitation_history: [...history, { id: randomUUID(), request_id: request.mutationId, request_sha256, created_at: new Date().toISOString(),
        source_json, source_sha256: elicitationHash(source_json), input_sha256, context_sha256, report_json, report_sha256: elicitationHash(report_json), decision: null }] };
    });
  }
  async decide(id: string, recordId: string, raw: unknown) {
    const request = elicitationDecisionSchema.parse(raw), digest = elicitationHash(stableKey({ recordId, action: request.action, answer: request.answer, reason: request.reason }));
    return this.profiles.commitResearchRecord(id, request.expectedRevision, current => {
      const history = current.grammar_elicitation_history ?? [], record = history.find(r => r.id === recordId);
      if (!record) throw new ProfileError('ELICITATION_MISSING', 'Grammar question not found', 404);
      const receipt = history.find(r => r.decision?.mutation_id === request.mutationId)?.decision;
      if (history.some(r => r.request_id === request.mutationId) || (receipt && receipt.digest !== digest) || current.recent_mutations.some(m => m.id === request.mutationId && m.digest !== digest)) throw new ProfileError('MUTATION_ID_REUSED', 'Decision identifier already used', 409);
      if (record.decision) {
        if (record.decision.mutation_id === request.mutationId && record.decision.digest === digest) return null;
        throw new ProfileError('ELICITATION_DECIDED', 'Question already decided', 409);
      }
      if (!grammarState(current, record).canDecide) throw new ProfileError('ELICITATION_STALE', 'Grounding or evidence changed, or question is historical. Select a new question.', 409);
      const next = structuredClone(current), source = grammarSource(record), report = grammarReport(record), created_at = new Date().toISOString();
      let observation_id: string | null = null, after_json: string | null = null;
      if (request.action === 'answer') {
        observation_id = randomUUID();
        next.research.observations.push({ id: observation_id, created_at, text: request.answer!, content_sha256: elicitationHash(request.answer!), source: request.reason,
          origin: 'capture', source_id: null, derived_from: [], audio: null });
        next.research.annotations.push({ id: randomUUID(), created_at, observation_id, revision: 1, interpretation: stableKey(report.selection!.meaning), supersedes: null, provenance: 'user' });
        after_json = JSON.stringify(grammarSessionReport({ ...source, declined: [], evidence: [...source.evidence, { observation_id, meaning: report.selection!.meaning!, answer: request.answer! }] }));
      }
      next.grammar_elicitation_history = history.map(r => r.id !== recordId ? r : { ...r, decision: { action: request.action, answer: request.answer, reason: request.reason,
        mutation_id: request.mutationId, digest, created_at, applied_revision: current.revision + 1, observation_id, after_json, after_sha256: after_json ? elicitationHash(after_json) : null } });
      next.recent_mutations = [...current.recent_mutations, { id: request.mutationId, digest, revision: current.revision + 1 }].slice(-128);
      return next;
    });
  }
}
