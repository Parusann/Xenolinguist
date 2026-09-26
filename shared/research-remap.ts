import type { Research } from './types.js';

/** Remap typed references, never source prose, meanings or hashes. Historical dependency snapshots follow the same mapping. */
export function remapResearch(research: Research, ids: Map<string, string>): Research {
  const scalar = new Set(['id', 'entry_id', 'entryId', 'rule_id', 'ruleId', 'clip_id', 'source_id', 'observation_id', 'annotation_id', 'analysis_id', 'hypothesis_id', 'supersedes']);
  const arrays = new Set(['derived_from', 'ruleIds']);
  const visit = (value: unknown, key = ''): unknown => {
    if (key === 'parent_annotations' && value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([id, annotation]) => [ids.get(id) ?? id, typeof annotation === 'string' ? ids.get(annotation) ?? annotation : annotation]));
    if (key === 'snapshot' && typeof value === 'string') return JSON.stringify(visit(JSON.parse(value)));
    if (typeof value === 'string' && scalar.has(key)) return ids.get(value) ?? value;
    if (Array.isArray(value)) return value.map(v => arrays.has(key) && typeof v === 'string' ? ids.get(v) ?? v : visit(v));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v, k)]));
    return value;
  };
  return visit(research) as Research;
}
