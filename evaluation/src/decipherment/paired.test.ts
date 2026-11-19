import { describe, expect, it } from 'vitest';
import { decision } from './paired.js';
import type { ItemScore } from './score.js';

function item(truthStatus: ItemScore['truthStatus'], success = true): ItemScore {
  return { id: 'fixture', truthStatus, outcome: truthStatus === 'identified' && success ? 'answer' : 'abstain',
    success, falseClaim: false, evidenceReferencesValid: null, confidence: null, brier: null };
}

function fixture(correct: number) {
  const lexical = Array.from({ length: 32 }, (_, i) =>
    i < 8 ? item('identified', i < correct) : item(i < 16 ? 'ambiguous' : 'insufficient'));
  return { lexical, transfer: Array.from({ length: 72 }, () => item('insufficient')) };
}

describe('frozen lexical acceptance gates', () => {
  it('requires both the absolute identified count and a four-answer paired gain', () => {
    expect(decision(fixture(2), fixture(6)).passed).toBe(true);
    expect(decision(fixture(3), fixture(6)).checks.identified).toBe(false);
    expect(decision(fixture(0), fixture(5)).checks.identified).toBe(false);
    expect(decision(fixture(0), fixture(0)).passed).toBe(false);
  });
  it('rejects even one unsupported unique answer on an uncertain item', () => {
    const candidate = fixture(6);
    Object.assign(candidate.lexical[8], { outcome: 'answer', success: false, falseClaim: true });
    expect(decision(fixture(2), candidate).checks.falseClaims).toBe(false);
  });
  it('separately counts uncertainty errors and missing responses', () => {
    const candidate = fixture(6);
    for (const i of [8, 9]) candidate.lexical[i].success = false;
    expect(decision(fixture(2), candidate).passed).toBe(true);
    candidate.lexical[10].success = false;
    for (const i of [8, 9]) candidate.lexical[i].outcome = 'missing';
    expect(decision(fixture(2), candidate).checks).toMatchObject({ uncertainty: false, validity: false });
  });
  it('counts transfer regressions against the matched base', () => {
    const candidate = fixture(6), base = fixture(2);
    for (const i of [0, 1, 2]) Object.assign(candidate.transfer[i], { outcome: 'answer', success: false, falseClaim: true });
    expect(decision(base, candidate).checks.transfer).toBe(false);
    Object.assign(base.transfer[0], candidate.transfer[0]);
    expect(decision(base, candidate).checks.transfer).toBe(true);
    for (const i of [3, 4, 5]) Object.assign(candidate.transfer[i], { outcome: 'error', success: false });
    expect(decision(base, candidate).checks.transfer).toBe(false);
  });
  it('refuses a reduced scheduled denominator', () => {
    const candidate = fixture(6);
    candidate.lexical.pop();
    expect(() => decision(fixture(0), candidate)).toThrow('denominator');
  });
});
