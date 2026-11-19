import { describe, expect, it } from 'vitest';
import { compareLanguages } from '../comparison/compare.js';
import { syntheticComparison } from '../../../evaluation/src/atlas/fixtures.js';

describe('evidence-backed atlas comparison', () => {
  it('recovers regular cross-script correspondences and audits unseen targets', () => {
    const { input, reference, unrelated, transform } = syntheticComparison(17);
    const report = compareLanguages(input, [unrelated, reference]);
    expect(report.state).toBe('complete');
    expect(report.matches[0].languageId).toBe('related');
    const related = report.matches[0];
    expect(related.orthographicSimilarity).toBe(0);
    expect(related.systematicSupport).toBe(1);
    expect(related.predictionAudit).toEqual({ scheduled: 24, emitted: 24, correct: 24, precision: 1 });
    expect(related.proposals).toHaveLength(6);
    for (const proposal of related.proposals) {
      const source = reference.entries.find(entry => entry.id === proposal.referenceIds[0])!;
      expect(proposal.forms).toEqual([transform(source.form)]);
      expect(proposal.state).toBe('proposed');
    }
    expect(report.matches[1].proposals).toHaveLength(0);
    expect(related.control.meanSystematicSupport).toBe(0);
  });

  it('retains sparse, unglossed, borrowed and conflicting evidence without unsupported proposals', () => {
    const { input, reference, unrelated } = syntheticComparison(81, 2);
    expect(compareLanguages(input, [reference]).state).toBe('insufficient');
    expect(compareLanguages(input, [reference]).matches[0].proposals).toEqual([]);
    const empty = compareLanguages({ ...input, entries: [{ id: 'sample', form: 'unsegmented text' }] }, [reference]);
    expect(empty.coverage.unanchoredEntries).toBe(1);
    expect(empty.coverage.anchoredConcepts).toBe(0);
    const dense = syntheticComparison(81);
    const borrowed = structuredClone(dense.unrelated);
    borrowed.entries[0].form = dense.input.entries[0].form;
    expect(compareLanguages(dense.input, [borrowed]).matches[0].proposals).toEqual([]);
    const contradictory = structuredClone(dense.input);
    contradictory.entries[0].form = 'xxxxx';
    const result = compareLanguages(contradictory, [dense.reference]);
    expect(result.matches[0].conflicts.length).toBeGreaterThan(0);
    expect(result.matches[0].proposals).toEqual([]);
    expect(unrelated.entries.length).toBe(reference.entries.length);
  });

  it('separates declared phonetics, observed grammar and unverified grammar', () => {
    const { input, reference } = syntheticComparison(17);
    input.entries = input.entries.map(entry => ({ ...entry, transcription: [...entry.form].join(' ') }));
    reference.entries = reference.entries.map(entry => ({ ...entry, transcription: [...entry.form].join(' ') }));
    reference.features.word_order = { value: 'SVO', allowedValues: ['SVO', 'SOV'], sourceId: 'synthetic',
      sourceUrl: 'https://example.invalid/feature', citation: 'Synthetic fixture' };
    input.features = { word_order: { value: 'SVO', status: 'hypothesis', source: 'Unverified guess' } };
    expect(compareLanguages(input, [reference]).matches[0].features).toEqual([]);
    input.features.word_order!.status = 'observed';
    const related = compareLanguages(input, [reference]).matches[0];
    expect(related.correspondenceBasis).toBe('declared-phonetic-segments');
    expect(related.features[0].state).toBe('agree');
    expect(related.proposals[0].forms[0]).toContain(' ');
    input.features.word_order!.value = 'free';
    expect(compareLanguages(input, [reference]).matches[0].features[0].state).toBe('unmapped');
  });

  it('abstains on ambiguous concept aliases and uncovered reference variants', () => {
    const { input, reference } = syntheticComparison(17);
    const distinct = { ...reference, sourceId: 'different-concepts', id: 'distinct' };
    expect(compareLanguages(input, [reference, distinct]).coverage.anchoredConcepts).toBe(0);
    const variant = { ...reference.entries[24], id: 'variant', form: 'zzzzz' };
    reference.entries.push(variant);
    const match = compareLanguages(input, [reference]).matches[0];
    expect(match.proposals.some(proposal => proposal.referenceIds.includes(variant.id))).toBe(false);
    expect(match.proposals).toHaveLength(5);
  });
});
