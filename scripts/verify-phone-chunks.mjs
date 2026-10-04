import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { root, sourceIdentity, hashFile, saveRecord } from './verification-record.mjs';
import { repeatPhoneFixture, verifyPhoneChunks } from './verify-phone-analysis.mjs';
const output=path.join(root,'test-results/chunked-phone-service.mjs');
const fixture=path.join(root,'server/src/__tests__/fixtures/hello-16k.wav');
process.env.IPA_MODEL_DIR ||= path.join(root,'vendor/ipa-model');
await mkdir(path.dirname(output),{recursive:true});
await build({entryPoints:[path.join(root,'server/src/services/ipa-phones.ts')],outfile:output,bundle:true,platform:'node',format:'esm',target:'node22',external:['@huggingface/transformers']});
const record={source:sourceIdentity(),fixture:await hashFile(fixture),repetitions:8,progress:[]};
try {
  const {transcribePhones}=await import(pathToFileURL(output).href);
  const wav=repeatPhoneFixture(await readFile(fixture),record.repetitions),start=performance.now();
  record.result=await transcribePhones({wav,onProgress:value=>record.progress.push({...value,elapsedMs:performance.now()-start})});
  record.elapsedMs=performance.now()-start;record.check=verifyPhoneChunks(record.result,wav);
  assert.ok(record.check.chunks>1);assert.equal(record.progress.length,record.check.chunks);
  record.progress.forEach((p,i)=>assert.deepEqual([p.completed,p.total],[i+1,record.check.chunks]));
  record.passed=true;console.log(JSON.stringify(record.check));
} catch(error) {record.passed=false;record.failure={message:error.message};process.exitCode=1;}
finally {await saveRecord(path.join(root,'test-results/phone-chunks-node.json'),record);}
