import { it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadCorpus, score, summarize, type NativeRecord } from './experiment.js';
const directory=fileURLToPath(new URL('../../fixtures/audio/l2-arctic-pilot/',import.meta.url));
it('verifies the licensed corpus and disjoint fixed selection without native inference',async()=>{
  const {corpus}=await loadCorpus(directory);
  expect(corpus.cases.filter(c=>c.split==='evaluation')).toHaveLength(12);
  expect(new Set(corpus.cases.map(c=>c.id.split('-')[1])).size).toBe(24);
});
it('keeps failed predictions in denominators and rejects missing scheduled attempts',async()=>{
  const {corpus}=await loadCorpus(directory),c=corpus.cases[0];
  const record:NativeRecord={id:c.id,preparedSha256:'0'.repeat(64),durationSeconds:4,preparationMs:0,attempts:[0,1,2].map(pass=>({pass,phoneMs:1,whisperMs:2,phoneError:'unavailable',whisperError:'unavailable'}))};
  expect(score(c,record).map(s=>[s.per.rate,s.wer.rate,s.phoneFailure])).toEqual([[1,1,true],[1,1,true],[1,1,true]]);
  expect(()=>score(c,{...record,attempts:record.attempts.slice(1)})).toThrow();
  expect(()=>summarize(corpus.cases,[record])).toThrow();
});
