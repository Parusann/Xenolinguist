import { mkdir,readFile,readdir,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { z } from 'zod';
import { key } from '../../../engine/src/induction/contracts.js';
import { experiment,summary,conditions,methods,type Experiment } from './experiment.js';
export const configSchema=z.strictObject({version:z.literal('grounded-ablation-1'),developmentSeeds:z.array(z.number().int().min(0).max(100000)).min(1).max(30),evaluationSeeds:z.array(z.number().int().min(0).max(100000)).min(1).max(30),conditions:z.array(z.enum(conditions)).min(1),methods:z.array(z.enum(methods)).length(4)}).superRefine((c,ctx)=>{
 if(new Set([...c.developmentSeeds,...c.evaluationSeeds]).size!==c.developmentSeeds.length+c.evaluationSeeds.length||new Set(c.conditions).size!==c.conditions.length||new Set(c.methods).size!==4)ctx.addIssue({code:'custom',message:'Seeds, conditions and methods must be unique; seed partitions must be disjoint.'});
});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export async function runInduction(configPath:string,directory:string,split:'development'|'evaluation') {
 const config=configSchema.parse(JSON.parse(await readFile(configPath,'utf8')));
 await mkdir(directory,{recursive:false});
 const paths=['package.json','package-lock.json','tsconfig.base.json'];
 const walk=async(relative:string)=>{for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){const p=relative+'/'+entry.name;if(entry.isDirectory())await walk(p);else if(p.endsWith('.ts')||p.endsWith('.json'))paths.push(p);}};
 await walk('engine/src');await walk('shared');await walk('evaluation');
 const files=[];for(const p of paths.sort()){const bytes=await readFile(path.join(root,p)),target=path.join(directory,'source',p);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);files.push({path:p,sha256:hash(bytes)});}
 const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const manifest={version:config.version,split,config,source:{commit:git('rev-parse','HEAD'),trackedDirty:!!git('status','--porcelain','--untracked-files=no'),files,snapshotHash:hash(key(files))},status:'running',startedAt:new Date().toISOString()};
 await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
 const records:Experiment[]=[];for(const seed of split==='development'?config.developmentSeeds:config.evaluationSeeds)for(const condition of config.conditions)records.push(experiment(seed,condition));
 const body=JSON.stringify(records),report=JSON.stringify(summary(records),null,2);
 await writeFile(path.join(directory,'records.json'),body);await writeFile(path.join(directory,'summary.json'),report);
 await writeFile(path.join(directory,'manifest.json'),JSON.stringify({...manifest,status:'complete',records:records.length,artifacts:[{path:'records.json',sha256:hash(body)},{path:'summary.json',sha256:hash(report)}]},null,2));
 return verifyInduction(directory);
}
export async function verifyInduction(directory:string) {
 const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')),config=configSchema.parse(manifest.config);
 if(manifest.status!=='complete'||!['development','evaluation'].includes(manifest.split))throw Error('Incomplete or invalid experiment');
 if(hash(key(manifest.source.files))!==manifest.source.snapshotHash)throw Error('Snapshot index mismatch');
 for(const f of [...manifest.artifacts,...manifest.source.files.map((f:{path:string;sha256:string})=>({...f,path:'source/'+f.path}))]) {
  const target=path.resolve(directory,f.path),rel=path.relative(path.resolve(directory),target);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Unsafe artifact path');
  if(hash(await readFile(target))!==f.sha256)throw Error('Artifact hash mismatch: '+f.path);
 }
 const records:Experiment[]=JSON.parse(await readFile(path.join(directory,'records.json'),'utf8'));
 const planned=new Set((manifest.split==='development'?config.developmentSeeds:config.evaluationSeeds).flatMap(seed=>config.conditions.map(c=>seed+':'+c)));
 for(const r of records){if(!planned.delete(r.seed+':'+r.condition))throw Error('Unexpected/duplicate cell');if(key(experiment(r.seed,r.condition))!==key(r))throw Error('Deterministic induction replay mismatch');}
 if(planned.size||records.length!==manifest.records)throw Error('Incomplete experiment cells');
 if(key(summary(records))!==key(JSON.parse(await readFile(path.join(directory,'summary.json'),'utf8'))))throw Error('Summary mismatch');
 return {passed:true,records:records.length,split:manifest.split,sourceSnapshotHash:manifest.source.snapshotHash};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
 const [mode,arg]=process.argv.slice(2);
 const task=mode==='verify'?verifyInduction(path.resolve(arg)):runInduction(path.join(root,'evaluation/configs/ablation.json'),path.join(root,'test-results','induction-'+(mode==='evaluation'?'evaluation':'development')+'-'+new Date().toISOString().replace(/[:.]/g,'-')),mode==='evaluation'?'evaluation':'development');
 task.then(console.log).catch(e=>{console.error(e);process.exitCode=1});
}
