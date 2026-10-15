import { createHash } from 'node:crypto';
import type { LanguageProfile } from '../../../shared/types.js';
import { elicitationSourceSchema, elicitationReportSchema, type ElicitationRecord, type ElicitationState } from '../../../shared/schemas/elicitation-records.js';
import { ProfileError } from '../../../shared/schemas/errors.js';
import { stableKey } from '../../../engine/src/elicitation/contracts.js';
import { numberSessionInput, numberSessionReport } from '../../../engine/src/elicitation/number-session.js';

export const elicitationHash = (text: string) => createHash('sha256').update(text).digest('hex');
export const elicitationInputHash = (p: LanguageProfile) => elicitationHash(stableKey(numberSessionInput(p)));
export const elicitationSource = (r: ElicitationRecord) => elicitationSourceSchema.parse(JSON.parse(r.source_json));
export const elicitationReport = (r: ElicitationRecord) => elicitationReportSchema.parse(JSON.parse(r.report_json));
export function elicitationState(profile: LanguageProfile, record: ElicitationRecord): ElicitationState {
  const stale = !!record.archived || elicitationSource(record).profile_id !== profile.id || elicitationInputHash(profile) !== record.input_sha256;
  return { id: record.id, stale, canDecide: !stale && !record.decision && !!elicitationReport(record).selection };
}
export function verifyElicitation(profile: LanguageProfile, previous?: LanguageProfile) {
  for (const record of profile.elicitation_history ?? []) {
    const old = previous?.elicitation_history?.find(r => r.id === record.id);
    if (old && stableKey(old) === stableKey(record)) continue;
    try {
      if (old && (stableKey({ ...old, decision: null }) !== stableKey({ ...record, decision: null }) || old.decision)) throw Error('Immutable record changed');
      const source = elicitationSource(record), report = elicitationReport(record);
      if (elicitationHash(record.source_json) !== record.source_sha256 || elicitationHash(record.report_json) !== record.report_sha256 ||
        elicitationHash(stableKey(source.input)) !== record.input_sha256 || stableKey(numberSessionReport(source.input, source.declined)) !== stableKey(report)) throw Error('Selection replay mismatch');
      const d = record.decision;
      if (d) {
        if (!report.selection || d.digest !== elicitationHash(stableKey({ recordId: record.id, action: d.action, answer: d.answer, reason: d.reason }))) throw Error('Decision mismatch');
        if (d.action === 'decline') {
          if (d.answer !== null || d.observation_id !== null || d.after_json !== null || d.after_sha256 !== null) throw Error('Decline cannot create evidence');
        } else {
          if (!d.answer || !d.observation_id || !d.after_json || elicitationHash(d.after_json) !== d.after_sha256) throw Error('Answer record missing');
          const afterInput = { ...source.input, validation: [...source.input.validation, { value: report.selection.value, form: d.answer }] };
          if (stableKey(numberSessionReport(afterInput, [])) !== stableKey(elicitationReportSchema.parse(JSON.parse(d.after_json)))) throw Error('Answer replay mismatch');
          const observation = profile.research.observations.find(o => o.id === d.observation_id);
          if (!observation || observation.text !== d.answer || observation.origin !== 'capture') throw Error('Answer capture missing');
        }
      }
    } catch { throw new ProfileError('ELICITATION_REPLAY_FAILED', 'Retained elicitation failed snapshot, selection or answer verification', 422); }
  }
}
