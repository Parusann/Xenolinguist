import { describe, it, expect } from 'vitest';

describe('client test harness', () => {
  it('runs in jsdom', () => {
    expect(typeof window).toBe('object');
    expect(document.createElement('div')).toBeTruthy();
  });
});
