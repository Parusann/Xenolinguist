import { describe, it, expect } from 'vitest';
import { DEMO_LANGUAGE } from '../../../shared/demo-language.js';

describe('DEMO_LANGUAGE seed', () => {
  it('is a populated, base-8, non-sandbox profile', () => {
    expect(DEMO_LANGUAGE.name).toBe('Eridian');
    expect(DEMO_LANGUAGE.is_sandbox).toBe(false);
    expect(DEMO_LANGUAGE.number_system.base).toBe(8);
    expect(DEMO_LANGUAGE.dictionary.length).toBeGreaterThanOrEqual(15);
    expect(DEMO_LANGUAGE.samples.length).toBeGreaterThanOrEqual(6);
    expect(DEMO_LANGUAGE.grammar_rules.length).toBeGreaterThanOrEqual(3);
  });

  it('has unique ids across dictionary/samples/grammar', () => {
    const ids = [
      ...DEMO_LANGUAGE.dictionary.map((d) => d.id),
      ...DEMO_LANGUAGE.samples.map((s) => s.id),
      ...DEMO_LANGUAGE.grammar_rules.map((r) => r.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every word in a decoded sample is known (dictionary or number system)', () => {
    const known = new Set<string>();
    for (const d of DEMO_LANGUAGE.dictionary) known.add(d.alien_word);
    for (const v of Object.values(DEMO_LANGUAGE.number_system.mappings)) {
      for (const w of v.split(/\s+/)) known.add(w);
    }
    for (const s of DEMO_LANGUAGE.samples) {
      if (!s.decoded) continue;
      for (const raw of s.alien_text.split(/\s+/)) {
        const token = raw.replace(/-en$/, ''); // strip the plural suffix (rule-2)
        expect(known, `unknown token "${raw}" in decoded sample "${s.alien_text}"`).toContain(token);
      }
    }
  });

  it('decoded samples have a translation; raw samples do not', () => {
    for (const s of DEMO_LANGUAGE.samples) {
      if (s.decoded) expect(s.english_translation).toBeTruthy();
      else expect(s.english_translation).toBeNull();
    }
  });
});
