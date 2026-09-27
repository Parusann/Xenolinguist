import { proposalContentSchema, researchProposalSchema, type ResearchProposal } from '../../../shared/schemas/proposals.js';
import { canonical } from '../../../engine/src/evidence/dependencies.js';
import { derive } from '../../../engine/src/translation/derive.js';
import { renderEnglish } from '../../../engine/src/translation/render.js';
import { proposalPreview, validateProposal } from '../../../server/src/services/proposal-validator.js';
import type { Case, Method, Visible } from './corpus.js';

/** Deliberately conservative v1 prose extraction: explicit standalone equations or affix assertions only.
 * No ground truth, second model or best-of selection is available here. Unmapped prose abstains. */
export function extractLegacy(text: string, visible: Visible) {
  const traces: { start: number; end: number; text: string; content: ResearchProposal['content'] }[] = [];
  for (const match of text.matchAll(/^.*$/gm)) {
    const line = match[0].trim().replace(/^[-*]\s+/, '');
    const lexical = line.match(/^[`"']?([\p{L}-]+)[`"']?\s*(?:=|means)\s*[`"']?([a-z]+)[`"']?\s*\(noun\)[.!]?$/iu);
    const grammar = line.match(/^(?:the\s+)?(prefix|suffix)\s+[`"']?([\p{L}-]+)[`"']?\s+(?:marks|indicates|encodes)\s+(past|future)(?:\s+tense)?[.!]?$/iu);
    let content: ResearchProposal['content'] | null = null;
    if (lexical && visible.family === 'lexical') content = { kind: 'lexical', form: lexical[1], meaning: lexical[2].toLowerCase(), part_of_speech: 'noun', verb_frame: null,
      entry_id: visible.profile.dictionary.find(w => w.alien_word === lexical[1])?.id ?? null };
    if (grammar && visible.family === 'tense') content = { kind: 'grammar', rule_id: null, rule: { kind: 'tense-affix', position: grammar[1].toLowerCase() as 'prefix' | 'suffix', affix: grammar[2], tense: grammar[3].toLowerCase() as 'past' | 'future' } };
    if (content && proposalContentSchema.safeParse(content).success) traces.push({ start: match.index, end: match.index + match[0].length, text: match[0], content });
  }
  const distinct = new Map(traces.map(t => [canonical(t.content), t.content]));
  return { traces, content: distinct.size === 1 ? [...distinct.values()][0] : null };
}
export function score(c: Case, method: Method, raw: string, proposal: unknown, failed: boolean) {
  const legacy = extractLegacy(raw, c.visible), parsed = researchProposalSchema.safeParse(proposal);
  const selected = method === 'legacy' ? legacy.content : parsed.success ? parsed.data.content : null;
  const candidate: ResearchProposal | null = selected && !failed ? method !== 'legacy' && parsed.success ? parsed.data : {
    scope: { profile_id: c.visible.profile.id, revision: c.visible.profile.revision }, label: 'Extracted legacy claim', explanation: 'Frozen conservative extraction', alternatives: ['Unknown'], citations: [], content: selected,
  } : null;
  const validation = candidate && method !== 'legacy' ? validateProposal(c.visible.profile, candidate, c.visible.tests) : null;
  const canonicalContent = (content: ResearchProposal['content']) => content.kind === 'lexical' ? { kind: content.kind, form: content.form, meaning: content.meaning, part_of_speech: content.part_of_speech, verb_frame: content.verb_frame }
    : content.kind === 'grammar' ? { kind: content.kind, rule: content.rule } : content;
  const oracleMatch = candidate ? canonical(canonicalContent(candidate.content)) === canonical(canonicalContent(c.oracle)) : false;
  const citations = candidate?.citations.map(citation => {
    const p = c.visible.profile, o = p.research.observations.find(o => o.id === citation.observation_id);
    const current = p.research.annotations.filter(a => a.observation_id === o?.id).at(-1)?.id ?? null;
    const withdrawn = p.research.events.some(e => e.kind === 'withdraw-observation' && e.observation_id === o?.id);
    const valid = Boolean(o && !withdrawn && citation.annotation_id === current && citation.end <= o.text.length && citation.start < citation.end && o.text.slice(citation.start, citation.end) === citation.quote);
    // Gold labels define relevance for the declared oracle candidate. Other claims are unscored,
    // not assigned false semantic precision using a string/ID match alone.
    const content = candidate!.content, oracle = c.oracle;
    const opposite = content.kind === 'lexical' && oracle.kind === 'lexical' && content.form === oracle.form && content.meaning === 'moon'
      || content.kind === 'grammar' && oracle.kind === 'grammar' && content.rule.kind === 'tense-affix' && oracle.rule.kind === 'tense-affix'
        && content.rule.affix === oracle.rule.affix && content.rule.position === oracle.rule.position && content.rule.tense === 'future';
    const focus = c.focusSpans[citation.observation_id];
    const relation = focus && citation.start <= focus.start && citation.end >= focus.end ? c.evidence[citation.observation_id] ?? 'irrelevant' : 'irrelevant';
    const gold = oracleMatch ? relation : opposite ? relation === 'supports' ? 'contradicts' : relation === 'contradicts' ? 'supports' : relation : null;
    return { ...citation, valid, gold, relationCorrect: valid && gold !== null && gold !== 'irrelevant' && citation.relation === gold };
  }) ?? [];
  const executable = candidate !== null && candidate.content.kind !== 'observation-request';
  const preview = executable ? proposalPreview(c.visible.profile, candidate!) : null;
  const content = candidate?.content;
  const target = preview && (content?.kind === 'lexical' ? content.entry_id ?? preview.dictionary.find(w => !c.visible.profile.dictionary.some(old => old.id === w.id))?.id
    : content?.kind === 'grammar' ? content.rule_id ?? preview.grammar_rules.find(r => !c.visible.profile.grammar_rules.some(old => old.id === r.id))?.id : null);
  const exercised = Boolean(preview && target && c.visible.tests.some(id => {
    const sample = c.visible.profile.samples.find(s => s.id === id)!; const result = derive(sample.alien_text, preview);
    return result.status === 'resolved' && result.candidates.some(p => content?.kind === 'lexical' ? p.steps.some(s => s.entryId === target) : p.ruleIds.includes(target));
  }));
  const predictions = c.challenges.map(challenge => {
    const result = preview ? derive(challenge.source, preview) : null;
    const rendered = result?.status === 'resolved' && result.candidates.length === 1 ? renderEnglish(result.candidates[0].tree) : null;
    const text = rendered?.status === 'rendered' ? rendered.text : null;
    return { ...challenge, predicted: text, status: !preview ? 'abstained' : text === null ? 'unresolved' : text === challenge.expected ? 'correct' : 'wrong', result };
  });
  const sections = c.visible.family === 'lexical' ? ['PATTERNS FOUND', 'WORD BOUNDARIES', 'HYPOTHESES', 'NOTES'] : ['WORD ORDER', 'MORPHOLOGY', 'SENTENCE STRUCTURE', 'HYPOTHESES'];
  return { formatCompliant: !failed && (method === 'legacy' ? sections.every(s => raw.toUpperCase().includes(s)) : parsed.success),
    executable, acceptanceEligible: validation?.status === 'compatible' && exercised, observationRequest: candidate?.content.kind === 'observation-request', invalidTypedOutput: method === 'legacy' ? null : raw.length > 0 && !parsed.success,
    legacyExtraction: method === 'legacy' ? legacy : null, validation, citations, oracleMatch, predictions };
}
export type Score = ReturnType<typeof score>;
export function summarize(records: { method: Method; condition: string; failed: boolean; elapsedMs: number; calls: unknown[]; score: Score }[]) {
  return [...new Set(records.map(r => r.condition))].flatMap(condition => (['legacy', 'contract', 'pipeline'] as const).map(method => {
    const rows = records.filter(r => r.condition === condition && r.method === method), scores = rows.map(r => r.score), citations = scores.flatMap(s => s.citations), predictions = scores.flatMap(s => s.predictions);
    const gold = citations.filter(c => c.gold !== null);
    return { condition, method, tasks: rows.length, failures: rows.filter(r => r.failed).length, formatCompliant: scores.filter(s => s.formatCompliant).length,
      executable: scores.filter(s => s.executable).length, requests: scores.filter(s => s.observationRequest).length,
      acceptanceEligible: scores.filter(s => s.acceptanceEligible).length,
      invalidTypedOutput: method === 'legacy' ? null : scores.filter(s => s.invalidTypedOutput).length,
      compatible: scores.filter(s => s.validation?.status === 'compatible').length, falsified: scores.filter(s => s.validation?.status === 'falsified').length,
      citations: citations.length, validReferences: citations.filter(c => c.valid).length, goldScoredCitations: gold.length,
      correctEvidenceRelations: gold.filter(c => c.relationCorrect).length, evidencePrecision: gold.length ? gold.filter(c => c.relationCorrect).length / gold.length : null,
      challenges: predictions.length, correct: predictions.filter(p => p.status === 'correct').length, wrong: predictions.filter(p => p.status === 'wrong').length,
      unresolved: predictions.filter(p => p.status === 'unresolved').length, abstained: predictions.filter(p => p.status === 'abstained').length,
      elapsedMs: rows.reduce((n, r) => n + r.elapsedMs, 0), calls: rows.reduce((n, r) => n + r.calls.length, 0) };
  }));
}
