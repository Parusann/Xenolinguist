import type { LanguageProfile } from '../types.js';

// Counts describe recorded content, never correctness or independent evidence.
export const normalizeContent = (text: string) => text.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
export const distinctCount = (items: string[]) => new Set(items.map(normalizeContent).filter(Boolean)).size;
export function countMappings(mappings: Record<string, string>, from: number, to: number) {
  return Object.entries(mappings).filter(([key, value]) => /^(0|[1-9]\d*)$/.test(key)
    && Number.isSafeInteger(Number(key)) && Number(key) >= from && Number(key) <= to && value.trim()).length;
}
export function workspaceMetrics(profile: LanguageProfile) {
  const meanings = new Map<string, Set<string>>();
  for (const entry of profile.dictionary) {
    const word = normalizeContent(entry.alien_word), meaning = normalizeContent(entry.english_meaning);
    if (!word || !meaning) continue;
    const candidates = meanings.get(word) ?? new Set<string>();
    candidates.add(meaning); meanings.set(word, candidates);
  }
  return {
    observations: distinctCount(profile.samples.map(sample => sample.alien_text)),
    assertedEntries: [...meanings.values()].reduce((sum, candidates) => sum + candidates.size, 0),
    grammarNotes: distinctCount(profile.grammar_rules.map(rule => rule.rule)),
    competingForms: [...meanings.values()].filter(candidates => candidates.size > 1).length,
    mappings1To20: countMappings(profile.number_system.mappings, 1, 20),
    ratedEntries: profile.dictionary.filter(entry => entry.confidence !== null).length,
  };
}

/** Sample only committed states. Never reconstruct past metrics from today's content. */
export function recordMetricSnapshot(profile: LanguageProfile): LanguageProfile {
  const counts = workspaceMetrics(profile);
  const previous = profile.metric_snapshots ?? [];
  if (previous.length && JSON.stringify(previous[previous.length - 1].counts) === JSON.stringify(counts)) return profile;
  return { ...profile, metric_snapshots: [...previous, {
    version: 1 as const, revision: profile.revision, recorded_at: profile.updated_at, counts,
  }].slice(-1000) };
}
