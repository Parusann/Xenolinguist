import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadWalsReference } from './ingest/wals.js';

it('preserves licensed structural sources, missing coverage and ambiguous language matches', async () => {
  const reference = await loadWalsReference(fileURLToPath(new URL('../../fixtures/reference/wals-pilot/', import.meta.url)));
  expect(reference.features).toHaveLength(12);
  expect(reference.features.every(feature => feature.targetLanguageId !== 'MandarinChinese' && feature.targetLanguageId !== 'KildinSaami')).toBe(true);
  expect(reference.features.find(feature => feature.targetLanguageId === 'English' && feature.key === 'word_order')?.value).toBe('SVO');
  expect(reference.attribution).toContain('Matthew S. Dryer');
  expect(reference.manifest.excluded).toEqual([{ language: 'MandarinChinese', reason: 'ambiguous-glottocode', candidates: ['kug', 'mnd'] }]);
  expect(reference.manifest.missing).toHaveLength(3);
  for (const feature of reference.features) {
    expect(feature.metadata.citation).toContain('2013');
    expect(feature.metadata.sourceUrl).toMatch(/^https:\/\/wals.info\/feature\//u);
    expect((feature.metadata.allowedValues as string[]).includes(feature.value)).toBe(true);
  }
});
