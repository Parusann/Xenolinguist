import { describe,it,expect } from 'vitest';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInduction,verifyInduction,configSchema } from './run.js';
import { groundedDataset } from './corpus.js';
import { conditions,methods } from './experiment.js';

describe('grounded ablation protocol',()=>{
 it('has disjoint lexical anchors across declared development and evaluation languages',()=>{
  const forms=new Set<string>();for(const seed of [...Array.from({length:12},(_,i)=>100+i),...Array.from({length:12},(_,i)=>200+i)])for(const entry of groundedDataset(seed).input.dictionary){expect(forms.has(entry.alien_word)).toBe(false);forms.add(entry.alien_word);}
 });
 it('rejects overlapping seed partitions and duplicate methods',()=>{
  expect(configSchema.safeParse({version:'grounded-ablation-1',developmentSeeds:[100],evaluationSeeds:[100],conditions:[...conditions],methods:[...methods]}).success).toBe(false);
 });
 it('replays exact cells and refuses overwritten or tampered artifacts',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'xeno-induction-protocol-'));
  try {
   const config=path.join(dir,'config.json'),out=path.join(dir,'run');await writeFile(config,JSON.stringify({version:'grounded-ablation-1',developmentSeeds:[100],evaluationSeeds:[200],conditions:[...conditions],methods:[...methods]}));
   expect(await runInduction(config,out,'development')).toMatchObject({passed:true,records:5});
   await expect(runInduction(config,out,'development')).rejects.toThrow();
   const file=path.join(out,'records.json'),original=await readFile(file);await writeFile(file,'[]');await expect(verifyInduction(out)).rejects.toThrow('Artifact hash mismatch');await writeFile(file,original);
   expect((await verifyInduction(out)).passed).toBe(true);
  }finally{if(path.dirname(path.resolve(dir))!==path.resolve(tmpdir())||!path.basename(dir).startsWith('xeno-induction-protocol-'))throw Error('Unsafe test cleanup');await rm(dir,{recursive:true,force:true});}
 },20000);
});
