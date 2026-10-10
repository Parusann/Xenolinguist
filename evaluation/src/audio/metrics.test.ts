import { describe, it, expect } from 'vitest';
import { phone, perceived, words, editDistance, alignment } from './metrics.js';
describe('frozen acoustic scoring', () => {
  it('normalizes stress, deviations, TIMIT allophones and silence explicitly', () => {
    expect(['AO1','AX-H','AXR','DX','ZH','EN','UW2*'].map(phone)).toEqual(['aa','ah','er','t','sh','n','uw']);
    expect(['sil','h#','pcl','q',''].map(phone)).toEqual([null,null,null,null,null]);
    expect(() => phone('not-a-phone')).toThrow();
  });
  it('uses perceived substitutions/additions and removes deleted phones', () => {
    expect(perceived('R,AH0,s')).toBe('ah'); expect(perceived('sil,S*,a')).toBe('s');
    expect(perceived('R,sil,d')).toBeNull(); expect(perceived('R,err,s')).toBe('<unresolved-reference>');
    expect(() => perceived('R,AH,d')).toThrow(); expect(() => perceived('R,AH')).toThrow();
  });
  it('retains contractions and removes punctuation in word scoring', () => {
    expect(words('“We’re HERE,” he said.')).toEqual(["we're",'here','he','said']);
  });
  it('counts insertions, deletions and substitutions against the reference denominator', () => {
    expect(editDistance(['a','b','c'],['a','x','c','d'])).toMatchObject({substitutions:1,insertions:1,deletions:0,errors:2,rate:2/3});
    expect(editDistance(['a','b'],[])).toMatchObject({deletions:2,rate:1});
    expect(editDistance([],['a'])).toMatchObject({insertions:1,rate:null});
    expect(editDistance(['a'],['b','c','d']).rate).toBe(3);
  });
  it('uses deterministic lexical alignment and exposes unmatched reference coverage', () => {
    const r=[{label:'a',start:0,end:0.1},{label:'b',start:0.1,end:0.2}];
    const h=[{label:'a',start:0.04,end:0.14}];
    expect(alignment(r,h)).toMatchObject({matchedPhones:1,withinTolerance:1,matchedBoundaryRate:1,referenceBoundaryCoverage:0.5});
    expect(alignment(r,[]).matchedBoundaryRate).toBeNull();
    expect(() => alignment(r,[{label:'a',start:NaN,end:1}])).toThrow();
  });
});
