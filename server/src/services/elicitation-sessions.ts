import { randomUUID } from 'node:crypto';
import { ProfileStore } from './profile-store.js';
import { ProfileError } from '../../../shared/schemas/errors.js';
import { ELICITATION_HISTORY_LIMIT, elicitationCreateSchema, elicitationDecisionSchema, elicitationSourceSchema } from '../../../shared/schemas/elicitation-records.js';
import { numberSessionInput, numberSessionReport } from '../../../engine/src/elicitation/number-session.js';
import { stableKey } from '../../../engine/src/elicitation/contracts.js';
import { elicitationHash, elicitationInputHash, elicitationReport, elicitationSource, elicitationState } from './elicitation-integrity.js';

export class ElicitationSessions {
  constructor(private readonly profiles = new ProfileStore()) {}
  async list(id: string) {
    const profile = await this.profiles.get(id);
    if (!profile) throw new ProfileError('PROFILE_MISSING', 'Project not found', 404);
    return { profile, states: (profile.elicitation_history ?? []).map(r => elicitationState(profile, r)) };
  }
  async create(id: string, raw: unknown) {
    const request = elicitationCreateSchema.parse(raw);
    return this.profiles.commitResearchRecord(id, request.expectedRevision, current => {
      const history = current.elicitation_history ?? [];
      if (history.some(r => r.request_id === request.mutationId)) return null;
      if (history.some(r => r.decision?.mutation_id === request.mutationId) || current.recent_mutations.some(m => m.id === request.mutationId)) throw new ProfileError('MUTATION_ID_REUSED', 'Request identifier already used', 409);
      if (history.length >= ELICITATION_HISTORY_LIMIT) throw new ProfileError('ELICITATION_HISTORY_LIMIT', 'Elicitation history has reached 20 records. Export the project before starting a new research project.', 413);
      const input_sha256 = elicitationInputHash(current);
      const declined = history.filter(r => !r.archived && r.input_sha256 === input_sha256 && r.decision?.action === 'decline').map(r => elicitationReport(r).selection!.value);
      const source = elicitationSourceSchema.parse({ profile_id: current.id, profile_revision: current.revision, input: numberSessionInput(current), declined });
      const source_json = JSON.stringify(source), report_json = JSON.stringify(numberSessionReport(source.input, declined));
      return { ...current, elicitation_history: [...history, { id: randomUUID(), request_id: request.mutationId, created_at: new Date().toISOString(),
        source_json, source_sha256: elicitationHash(source_json), input_sha256, report_json, report_sha256: elicitationHash(report_json), decision: null }] };
    });
  }
  async decide(id: string, recordId: string, raw: unknown) {
    const request = elicitationDecisionSchema.parse(raw), digest = elicitationHash(stableKey({ recordId, action: request.action, answer: request.answer, reason: request.reason }));
    return this.profiles.commitResearchRecord(id, request.expectedRevision, current => {
      const history = current.elicitation_history ?? [], record = history.find(r => r.id === recordId);
      if (!record) throw new ProfileError('ELICITATION_MISSING', 'Question not found in this project', 404);
      const receipt = history.find(r => r.decision?.mutation_id === request.mutationId)?.decision;
      const ledger = current.recent_mutations.find(m => m.id === request.mutationId);
      if (history.some(r => r.request_id === request.mutationId) || (receipt && receipt.digest !== digest) || (ledger && ledger.digest !== digest)) throw new ProfileError('MUTATION_ID_REUSED', 'Decision identifier already used', 409);
      if (record.decision) {
        if (record.decision.mutation_id === request.mutationId && record.decision.digest === digest) return null;
        throw new ProfileError('ELICITATION_DECIDED', 'This question already has a recorded decision', 409);
      }
      if (!elicitationState(current, record).canDecide) throw new ProfileError('ELICITATION_STALE', 'Question is unavailable, restored or based on changed evidence. Select a new question.', 409);
      const next = structuredClone(current), report = elicitationReport(record), source = elicitationSource(record);
      const created_at = new Date().toISOString();
      let observation_id: string | null = null, after_json: string | null = null;
      if (request.action === 'answer') {
        if (source.input.validation.length >= 64) throw new ProfileError('ELICITATION_VALIDATION_LIMIT', 'The 64-observation validation limit has been reached', 413);
        const value = report.selection!.value, answer = request.answer!;
        next.number_system.mappings[String(value)] = answer;
        next.number_system.validation_values = [...new Set([...(next.number_system.validation_values ?? []), value])];
        if (next.number_system.validation_values.length > 64) throw new ProfileError('ELICITATION_VALIDATION_LIMIT', 'Clear unused validation selections before adding an answer', 413);
        observation_id = randomUUID();
        next.research.observations.push({ id: observation_id, created_at, text: answer, content_sha256: elicitationHash(answer), source: `Observed form for integer ${value}. ${request.reason}`,
          origin: 'capture', source_id: null, derived_from: [], audio: null });
        next.research.annotations.push({ id: randomUUID(), created_at, observation_id, revision: 1, interpretation: `Integer ${value}`, supersedes: null, provenance: 'user' });
        after_json = JSON.stringify(numberSessionReport(numberSessionInput(next), []));
      }
      next.elicitation_history = history.map(r => r.id !== recordId ? r : { ...r, decision: { action: request.action, answer: request.answer, reason: request.reason,
        mutation_id: request.mutationId, digest, created_at, applied_revision: current.revision + 1, observation_id, after_json, after_sha256: after_json ? elicitationHash(after_json) : null } });
      next.recent_mutations = [...current.recent_mutations, { id: request.mutationId, digest, revision: current.revision + 1 }].slice(-128);
      return next;
    });
  }
}
