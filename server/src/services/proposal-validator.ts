import { createHash } from 'node:crypto';
import type { LanguageProfile } from '../../../shared/types.js';
import { researchProposalSchema, PROPOSAL_LIMITS, type ResearchProposal, type ProposalValidation, type ProposalCheck } from '../../../shared/schemas/proposals.js';
import { canonical } from '../../../engine/src/evidence/dependencies.js';
import { latestAnnotation, observationUnavailable } from '../../../engine/src/evidence/graph.js';
import { derive, type GrammarProfile } from '../../../engine/src/translation/derive.js';
import { renderEnglish } from '../../../engine/src/translation/render.js';
import { compileGrammar } from '../../../engine/src/grammar/transforms.js';

export const proposalInputHash = (p: LanguageProfile, tests: string[]) => createHash('sha256').update(canonical({ profile_id: p.id, revision: p.revision,
  dictionary: p.dictionary, grammar_rules: p.grammar_rules, lexical_policy: p.lexical_policy ?? null, research: p.research,
  samples: p.samples, validation_sample_ids: tests })).digest('hex');
const normalize = (s: string) => s.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
function check(source: string, expected: string, profile: GrammarProfile): ProposalCheck['before'] {
  const result = derive(source, profile);
  const rendered = result.status === 'resolved' && result.candidates.length === 1 ? renderEnglish(result.candidates[0].tree) : null;
  if (!rendered || rendered.status !== 'rendered') return { outcome: 'unresolved', rendered: null };
  return { outcome: normalize(rendered.text) === normalize(expected) ? 'matches' : 'differs', rendered: rendered.text };
}
/** A preview only. It cannot change the profile and never manufactures confirmed knowledge. */
export function proposalPreview(p: LanguageProfile, proposal: ResearchProposal): GrammarProfile {
  const copy: GrammarProfile = structuredClone({ dictionary: p.dictionary, grammar_rules: p.grammar_rules, lexical_policy: p.lexical_policy });
  const content = proposal.content;
  const usedIds = new Set([...p.dictionary, ...p.grammar_rules].map(v => v.id));
  let suffix = 0, freshId = 'proposal-preview'; while (usedIds.has(freshId)) freshId = `proposal-preview-${++suffix}`;
  if (content.kind === 'lexical') {
    const old = copy.dictionary.find(w => w.id === content.entry_id);
    // A replacement changes one asserted sense explicitly; it does not retain hidden old senses.
    const value = { id: content.entry_id ?? freshId, created_at: old?.created_at ?? p.updated_at, alien_word: content.form,
      english_meaning: content.meaning, senses: [{ meaning: content.meaning, aliases: [] }], part_of_speech: content.part_of_speech,
      verb_frame: content.verb_frame, confidence: null, user_asserted_confidence: null,
      context: old?.context ?? '', notes: old?.notes ?? '', examples: old?.examples ?? [] };
    copy.dictionary = old ? copy.dictionary.map(w => w.id === old.id ? value : w) : [...copy.dictionary, value];
  } else if (content.kind === 'grammar') {
    const old = copy.grammar_rules.find(r => r.id === content.rule_id);
    const value = { id: content.rule_id ?? freshId, created_at: old?.created_at ?? p.updated_at, rule: proposal.label,
      executable: content.rule, confidence: null, user_asserted_confidence: null, evidence: [] };
    copy.grammar_rules = old ? copy.grammar_rules.map(r => r.id === old.id ? value : r) : [...copy.grammar_rules, value];
  }
  return copy;
}
/** Tests and targets come from the caller's selected workspace samples, never from model output. */
export function validateProposal(p: LanguageProfile, input: unknown, sampleIds: string[]): ProposalValidation {
  const result: ProposalValidation = { definition: 'proposal-checks-1', status: 'invalid', errors: [], checks: [],
    references: { valid: 0, total: 0 }, input_sha256: proposalInputHash(p, sampleIds), changes: [], limitations: [
      'Reference integrity checks locate quoted text; they do not verify that a citation supports the claim.',
      'User-supplied targets are workspace checks, not held-out accuracy or calibrated confidence.',
      'Compatibility covers only the selected samples and the bounded typed grammar engine.',
    ] };
  const parsed = researchProposalSchema.safeParse(input);
  if (!parsed.success) { result.errors.push(...parsed.error.issues.slice(0, 8).map(issue => `${issue.path.join('.')}: ${issue.message}`)); return result; }
  const proposal = parsed.data, content = proposal.content;
  if (proposal.scope.profile_id !== p.id || proposal.scope.revision !== p.revision) result.errors.push('Proposal scope does not match this profile revision');
  if (sampleIds.length > PROPOSAL_LIMITS.tests || new Set(sampleIds).size !== sampleIds.length) result.errors.push('Invalid validation sample selection');
  for (const id of sampleIds.slice(0, PROPOSAL_LIMITS.tests)) {
    const sample = p.samples.find(s => s.id === id);
    if (!sample || !sample.english_translation?.trim() || sample.alien_text.length > 2048 || sample.english_translation.length > 2048)
      result.errors.push(`Validation sample ${id} is missing, lacks a user target or exceeds the test limit`);
  }
  result.references.total = proposal.citations.length;
  const seen = new Set<string>();
  for (const citation of proposal.citations) {
    const o = p.research.observations.find(o => o.id === citation.observation_id);
    const key = `${citation.observation_id}:${citation.start}:${citation.end}`;
    if (seen.has(key)) { result.errors.push('Duplicate cited span'); continue; } seen.add(key);
    if (!o || observationUnavailable(p.research, o.id)) result.errors.push(`Observation ${citation.observation_id} is missing or unavailable`);
    else if (citation.annotation_id !== (latestAnnotation(p.research, o.id)?.id ?? null)) result.errors.push(`Observation ${o.id} has a different interpretation revision`);
    else if (citation.start >= citation.end || citation.end > o.text.length || o.text.slice(citation.start, citation.end) !== citation.quote)
      result.errors.push(`Quoted span does not match observation ${o.id}`);
    else result.references.valid++;
  }
  if (content.kind === 'lexical') {
    if (content.entry_id && !p.dictionary.some(w => w.id === content.entry_id)) result.errors.push('Replacement lexical entry is not in this profile');
    if (content.part_of_speech === 'verb' ? content.verb_frame === null : content.verb_frame !== null) result.errors.push('Verbs require an argument frame; other parts of speech cannot set one');
    result.changes.push(`${content.entry_id ? 'Replace the complete lexical entry ' + content.entry_id : 'Add an unrated lexical entry'}: ${content.form} = ${content.meaning}`);
  } else if (content.kind === 'grammar') {
    if (content.rule_id && !p.grammar_rules.some(r => r.id === content.rule_id)) result.errors.push('Replacement rule is not in this profile');
    result.changes.push(`${content.rule_id ? 'Replace rule ' + content.rule_id : 'Add an unrated executable rule'}: ${JSON.stringify(content.rule)}`);
  } else result.changes.push('Request another observation; do not add a word, rule or observed fact');
  if (result.errors.length) return result;
  if (content.kind === 'observation-request') { result.status = 'request'; return result; }
  const preview = proposalPreview(p, proposal);
  try { compileGrammar(preview.grammar_rules, preview.lexical_policy); }
  catch (error) { result.errors.push(String(error)); return result; }
  for (const id of sampleIds) {
    const sample = p.samples.find(s => s.id === id)!;
    const before = check(sample.alien_text, sample.english_translation!, p), after = check(sample.alien_text, sample.english_translation!, preview);
    result.checks.push({ sample_id: id, source: sample.alien_text, expected: sample.english_translation!, before, after,
      regression: before.outcome === 'matches' && after.outcome !== 'matches' });
  }
  result.status = result.checks.some(c => c.after.outcome === 'differs' || c.regression) ? 'falsified'
    : !result.checks.length || result.checks.some(c => c.after.outcome === 'unresolved') ? 'inconclusive' : 'compatible';
  return result;
}
