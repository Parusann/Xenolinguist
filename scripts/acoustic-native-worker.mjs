// Bundled by evaluate-audio.mjs; one process per clip, one cold and two reused-model calls.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { transcribePhones } from '../server/src/services/ipa-phones.ts';
import { transcribe } from '../server/src/services/stt-whisper.ts';
import { inspectPcmWav } from '../shared/audio-container.ts';
import { downsampleTo16k, encodeWavPcm16 } from '../client/src/components/audio/wav-encode.ts';
const [source,destination,id]=process.argv.slice(2), start=performance.now();
const original=await readFile(source), geometry=inspectPcmWav(original);
let offset=12;
while(original.toString('ascii',offset,offset+4)!=='data') {const n=original.readUInt32LE(offset+4);offset+=8+n+(n&1);}
const count=original.readUInt32LE(offset+4)/2/geometry.channels, mono=new Float32Array(count);
for(let i=0;i<count;i++)for(let c=0;c<geometry.channels;c++)mono[i]+=original.readInt16LE(offset+8+(i*geometry.channels+c)*2)/32768/geometry.channels;
const samples=downsampleTo16k(mono,geometry.rate),wav=Buffer.from(encodeWavPcm16(samples,16000));
const record={id,preparedSha256:createHash('sha256').update(wav).digest('hex'),durationSeconds:samples.length/16000,preparationMs:performance.now()-start,attempts:[]};
for(let pass=0;pass<3;pass++) {
  const attempt={pass}; let began=performance.now();
  try {attempt.phones=await transcribePhones({wav});}catch(e){attempt.phoneError=String(e.code??e.message);}
  attempt.phoneMs=performance.now()-began;began=performance.now();
  try {attempt.transcription=await transcribe({wav,language:'en'});}catch(e){attempt.whisperError=String(e.code??e.message);}
  attempt.whisperMs=performance.now()-began; record.attempts.push(attempt);
  await writeFile(destination,JSON.stringify(record)+'\n');
}
