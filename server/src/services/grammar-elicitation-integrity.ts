import type { LanguageProfile } from '../../../shared/types.js';
import type { GrammarRecord } from '../../../shared/schemas/grammar-elicitation.js';
import { grammarContext, grammarSourceSchema, grammarSessionReport, type GrammarSource, type GrammarSessionReport } from '../../../engine/src/elicitation/grammar-session.js';
import { stableKey } from '../../../engine/src/elicitation/contracts.js';
import { elicitationHash } from './elicitation-integrity.js';
import { ProfileError } from '../../../shared/schemas/errors.js';

export const grammarSource = (r: GrammarRecord) => grammarSourceSchema.parse(JSON.parse(r.source_json));
export const grammarReport = (r: GrammarRecord) => JSON.parse(r.report_json) as GrammarSessionReport;
export function grammarEvidence(profile: LanguageProfile, contextHash: string): GrammarSource['evidence'] {
  return (profile.grammar_elicitation_history ?? []).flatMap(r => {
    const d = r.decision;
    if (r.archived || r.context_sha256 !== contextHash || d?.action !== 'answer' || !d.observation_id || !d.answer) return [];
    const meaning = grammarReport(r).selection!.meaning!;
    const annotation = profile.research.annotations.filter(a => a.observation_id === d.observation_id).sort((a, b) => b.revision - a.revision)[0];
    if (profile.research.events.some(e => e.kind === 'withdraw-observation' && e.observation_id === d.observation_id) || annotation?.interpretation !== stableKey(meaning)) return [];
    return [{ meaning, answer: d.answer, observation_id: d.observation_id }];
  });
}
export const grammarInputHash = (context: GrammarSource['context'], evidence: GrammarSource['evidence']) => elicitationHash(stableKey({ context, evidence }));
export function grammarState(profile: LanguageProfile, r: GrammarRecord) {
  let stale = true;
  try {
    const s = grammarSource(r), context = grammarContext(profile, s.setup);
    stale = !!r.archived || s.profile_id !== profile.id || grammarInputHash(context, grammarEvidence(profile, elicitationHash(stableKey(context)))) !== r.input_sha256;
  } catch { /* Missing or changed lexical/rule grounding is stale, never executable. */ }
  return { id: r.id, stale, canDecide: !stale && !r.decision && !!grammarReport(r).selection };
}
export function verifyGrammarElicitation(profile: LanguageProfile, previous?: LanguageProfile) {
  for (const r of profile.grammar_elicitation_history ?? []) {
    const old = previous?.grammar_elicitation_history?.find(o => o.id === r.id);
    if (old && stableKey(old) === stableKey(r)) continue;
    try {
      if (old && (old.decision || stableKey({ ...old, decision: null }) !== stableKey({ ...r, decision: null }))) throw Error('Immutable question changed');
      const s = grammarSource(r), report = grammarReport(r), d = r.decision;
      if (elicitationHash(r.source_json) !== r.source_sha256 || elicitationHash(r.report_json) !== r.report_sha256 ||
        elicitationHash(stableKey(s.setup)) !== r.request_sha256 || elicitationHash(stableKey(s.context)) !== r.context_sha256 ||
        grammarInputHash(s.context, s.evidence) !== r.input_sha256 || stableKey(grammarSessionReport(s)) !== stableKey(report)) throw Error('Selection replay mismatch');
      if (d) {
        if (!report.selection?.meaning || d.digest !== elicitationHash(stableKey({ recordId: r.id, action: d.action, answer: d.answer, reason: d.reason }))) throw Error('Invalid decision');
        if (d.action === 'decline') {
          if (d.answer !== null || d.observation_id !== null || d.after_json !== null || d.after_sha256 !== null) throw Error('Decline changed evidence');
        } else {
          if (!d.answer || !d.observation_id || !d.after_json || elicitationHash(d.after_json) !== d.after_sha256) throw Error('Answer missing');
          // Capture identities do not affect prediction or scoring; restored captures have new IDs.
          const after = grammarSessionReport({ ...s, declined: [], evidence: [...s.evidence, { meaning: report.selection.meaning, answer: d.answer, observation_id: d.observation_id }] });
          const capture = profile.research.observations.find(o => o.id === d.observation_id);
          if (stableKey(after) !== stableKey(JSON.parse(d.after_json)) || capture?.text !== d.answer || capture.origin !== 'capture') throw Error('Answer replay mismatch');
        }
      }
    } catch { throw new ProfileError('GRAMMAR_ELICITATION_REPLAY_FAILED', 'Retained grammar question failed snapshot, selection or answer verification', 422); }
  }
}
