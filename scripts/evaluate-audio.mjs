import { build } from 'esbuild';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { execFileSync,spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { root,sourceIdentity,hashFile } from './verification-record.mjs';
const [mode='verify',folder='test-results/acoustic-pilot']=process.argv.slice(2);
if(!['run','verify'].includes(mode))throw Error('Use run or verify');
const directory=path.resolve(folder),corpusDir=path.join(root,'evaluation/fixtures/audio/l2-arctic-pilot');
const tooling=path.join(root,'test-results/acoustic-tooling');await mkdir(tooling,{recursive:true});
const scorer=path.join(tooling,'scorer.mjs');
await build({entryPoints:[path.join(root,'evaluation/src/audio/experiment.ts')],outfile:scorer,bundle:true,platform:'node',format:'esm',packages:'external'});
const {loadCorpus,summarize,sha}=await import(pathToFileURL(scorer).href);
const {corpus,hash}=await loadCorpus(corpusDir);
const scoringHash=sha((await Promise.all(['metrics.ts','experiment.ts'].map(f=>readFile(path.join(root,'evaluation/src/audio',f),'utf8')))).map(s=>s.replace(/\r\n/g,'\n')).join('\n'));
const json=async file=>JSON.parse(await readFile(file,'utf8'));
if(mode==='run') {
  if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim())throw Error('Commit the protocol and corpus before inference');
  await mkdir(directory,{recursive:false});
  const worker=path.join(tooling,'native-worker.mjs');
  const built=await build({entryPoints:[path.join(root,'scripts/acoustic-native-worker.mjs')],outfile:worker,bundle:true,platform:'node',format:'esm',target:'node22',external:['@huggingface/transformers'],alias:{shared:path.join(root,'shared')},metafile:true});
  const files=[...new Set([...Object.keys(built.metafile.inputs),'evaluation/src/audio/metrics.ts','evaluation/src/audio/experiment.ts','scripts/evaluate-audio.mjs','package-lock.json'])].sort();
  const sourceFiles=[];for(const f of files)sourceFiles.push({file:f,...await hashFile(path.join(root,f))});
  const manifest={protocol:corpus.version,status:'running',source:sourceIdentity(),sourceFiles,scoringHash,corpusHash:hash,startedAt:new Date().toISOString(),
    environment:{platform:os.platform(),release:os.release(),arch:os.arch(),cpus:os.cpus().map(c=>c.model),memoryBytes:os.totalmem(),node:process.versions.node},records:[]};
  const save=()=>writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await save();
  for(const c of corpus.cases) {
    const file=c.id+'.json';
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[worker,path.join(corpusDir,c.original.file),path.join(directory,file),c.id],{cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe'],
        env:{...process.env,IPA_MODEL_DIR:path.join(root,'vendor/ipa-model'),WHISPER_BIN:path.join(root,'vendor/whisper/win/whisper-cli.exe'),WHISPER_MODEL:path.join(root,'vendor/whisper/win/ggml-base-q5_1.bin')}});
      let error='';child.stderr.on('data',b=>{error=(error+b.toString()).slice(-4000);});
      const timer=setTimeout(()=>child.kill(),600000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Worker failed '+c.id+': '+error));});
    });
    manifest.records.push({file,...await hashFile(path.join(directory,file))});await save();console.log('Recorded '+c.id);
  }
  const records=await Promise.all(manifest.records.map(r=>json(path.join(directory,r.file))));
  await writeFile(path.join(directory,'summary.json'),JSON.stringify(summarize(corpus.cases,records),null,2)+'\n');
  manifest.summary=await hashFile(path.join(directory,'summary.json'));manifest.status='complete';await save();
}
const manifest=await json(path.join(directory,'manifest.json'));
assert.equal(manifest.status,'complete');assert.equal(manifest.protocol,corpus.version);assert.equal(manifest.corpusHash,hash);
assert.equal(manifest.scoringHash,scoringHash,'Replay requires the frozen scoring implementation');
assert.equal(manifest.records.length,24);assert.equal(new Set(manifest.records.map(r=>r.file)).size,24);
const records=[];
for(const r of manifest.records){assert.match(r.file,/^(ASI|LXC)-arctic_[ab]\d{4}\.json$/);assert.deepEqual(await hashFile(path.join(directory,r.file)),{bytes:r.bytes,sha256:r.sha256});records.push(await json(path.join(directory,r.file)));}
assert.deepEqual(await hashFile(path.join(directory,'summary.json')),manifest.summary);
assert.deepEqual(summarize(corpus.cases,records),await json(path.join(directory,'summary.json')));
console.log(JSON.stringify({passed:true,records:records.length,attempts:records.length*3,corpusHash:hash,summary:manifest.summary,scope:'Replays retained scores, not native inference or timing.'}));
