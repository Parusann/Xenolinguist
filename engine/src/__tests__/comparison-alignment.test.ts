import { describe, expect, it } from 'vitest';
import { alignUnits, orthographicUnits, transcriptionUnits, ComparisonLimitError } from '../comparison/alignment.js';
import { correspondenceModel, proposeForm, type AlignedEvidence } from '../comparison/correspondences.js';

const budget = () => ({ deadline: performance.now() + 10000, usedCells: 0, maxCells: 1000000 });
const evidence = (concept: string, source: string[], target: string[]): AlignedEvidence =>
  ({ concept, queryId: 'q-' + concept, referenceId: 'r-' + concept, alignment: alignUnits(source, target, budget()) });

describe('bounded comparison alignments', () => {
  it('preserves grapheme boundaries and distinguishes declared transcription from forms', () => {
    expect(orthographicUnits(' e\u0301ɑ\u0303 ')).toEqual(['é', 'ɑ̃']);
    expect(transcriptionUnits('[tʃ aː n]')).toEqual(['tʃ', 'aː', 'n']);
    expect(transcriptionUnits('a/aː n')).toBeNull();
  });
  it('retains insertions, deletions and alignment ambiguity', () => {
    expect(alignUnits(['a', 'b'], ['a'], budget())).toMatchObject({ distance: 1, unique: true });
    expect(alignUnits(['a'], ['a', 'a'], budget())).toMatchObject({ distance: 1, unique: false });
    expect(alignUnits(['a', 'b'], ['b', 'a'], budget()).unique).toBe(false);
  });
  it('learns a regular correspondence across concepts and withholds unseen symbols', () => {
    const pairs = [evidence('one', ['a', 'b'], ['χ', 'ψ']), evidence('two', ['b', 'a'], ['ψ', 'χ']),
      evidence('three', ['a', 'a', 'b'], ['χ', 'χ', 'ψ'])];
    const model = correspondenceModel(pairs);
    expect(model).toMatchObject({ support: 1, fitsAllAnchors: true, conflicts: [] });
    expect(proposeForm(['b', 'a'], model)).toEqual(['ψ', 'χ']);
    expect(proposeForm(['c'], model)).toBeNull();
  });
  it('avoids inflating evidence with repeated synonyms and exposes counterexamples', () => {
    const repeated = Array.from({ length: 6 }, () => evidence('same', ['a'], ['χ']));
    expect(correspondenceModel(repeated).rules).toHaveLength(0);
    expect(correspondenceModel(['one', 'two', 'three'].map(concept => evidence(concept, ['a'], ['χ']))).rules).toHaveLength(0);
    const conflict = correspondenceModel([...['one', 'two', 'three'].map(concept => evidence(concept, ['a'], ['χ'])),
      evidence('counterexample', ['a'], ['ψ'])]);
    expect(conflict.conflicts).toEqual([{ source: 'a', targets: ['χ', 'ψ'] }]);
    expect(proposeForm(['a'], conflict)).toBeNull();
  });
  it('enforces cell and deadline budgets', () => {
    expect(() => alignUnits(['a'], ['a'], { ...budget(), maxCells: 1 })).toThrow(ComparisonLimitError);
    expect(() => alignUnits(['a'], ['a'], { ...budget(), deadline: 0 })).toThrow(ComparisonLimitError);
  });
});
