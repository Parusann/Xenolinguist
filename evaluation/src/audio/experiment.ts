import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { retainedPhoneResultSchema } from '../../../shared/schemas/phone-analysis.js';
import { transcriptionResultSchema } from '../../../shared/schemas/transcription.js';
import { AUDIO_PROTOCOL, alignment, perceived, phone, words, editDistance, type Span } from './metrics.js';
export const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const span = z.object({label:z.string(), start:z.number().nonnegative(), end:z.number().positive()}).strict().refine(s => s.end > s.start);
const asset = z.object({ file:z.string().regex(/^[A-Z]+-arctic_[ab]\d{4}\.(wav|TextGrid)$/), sha256:z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const corpusSchema = z.object({version:z.literal(AUDIO_PROTOCOL), source:z.string(), mirror:z.string(), archiveSha256:z.record(z.string(),z.string()), license:z.literal('CC-BY-NC-4.0'), licenseSha256:z.string(), selection:z.string(), cases:z.array(z.object({id:z.string(),speaker:z.enum(['ASI','LXC']),split:z.enum(['development','evaluation']),original:asset,annotation:asset,phones:z.array(span),words:z.array(span)}).strict()).length(24)}).strict();
export type Case = z.infer<typeof corpusSchema>['cases'][number];
export async function loadCorpus(directory: string) {
  const bytes = await readFile(path.join(directory,'corpus.json')), corpus = corpusSchema.parse(JSON.parse(bytes.toString()));
  if (sha(await readFile(path.join(directory,'LICENSE'))) !== corpus.licenseSha256) throw Error('Corpus license mismatch');
  const ids = new Set<string>(), prompts = new Set<string>();
  for (const speaker of ['ASI','LXC']) if (corpus.cases.filter(c=>c.speaker===speaker).length!==12) throw Error('Expected 12 recordings per speaker');
  for (const c of corpus.cases) {
    if (ids.has(c.id) || prompts.has(c.id.split('-')[1]) || c.split !== (c.speaker === 'ASI' ? 'development' : 'evaluation')) throw Error('Corpus partition mismatch');
    ids.add(c.id); prompts.add(c.id.split('-')[1]);
    for (const a of [c.original,c.annotation]) if (sha(await readFile(path.join(directory,a.file))) !== a.sha256) throw Error('Corpus asset mismatch: '+a.file);
    // Fail before inference for unsupported annotation conventions; retain opaque err labels.
    for (const s of c.phones) perceived(s.label);
  }
  return {corpus, hash:sha(bytes)};
}
type Attempt = {pass:number; phoneMs:number; whisperMs:number; phones?:unknown; transcription?:unknown; phoneError?:string; whisperError?:string};
export type NativeRecord = {id:string; preparedSha256:string; durationSeconds:number; preparationMs:number; attempts:Attempt[]};
const reference = (c:Case):Span[] => c.phones.flatMap(s => { const label=perceived(s.label); return label ? [{...s,label}] : []; });
export function score(c:Case, record:NativeRecord) {
  if (record.id !== c.id || record.attempts.length !== 3 || !/^[a-f0-9]{64}$/.test(record.preparedSha256) || !Number.isFinite(record.durationSeconds) || record.durationSeconds <= 0) throw Error('Invalid native record');
  const ref = reference(c), wordRef=words(c.words.map(s=>s.label).join(' '));
  if (!ref.length || !wordRef.length) throw Error('Empty reference');
  return record.attempts.map((a,index)=>{
    if (a.pass !== index || !Number.isFinite(a.phoneMs) || a.phoneMs<0 || !Number.isFinite(a.whisperMs) || a.whisperMs<0) throw Error('Invalid attempt');
    if (Boolean(a.phones) === Boolean(a.phoneError) || Boolean(a.transcription) === Boolean(a.whisperError)) throw Error('Result/error must be exclusive');
    const p = a.phones ? retainedPhoneResultSchema.parse(a.phones) : undefined;
    const t = a.transcription ? transcriptionResultSchema.parse(a.transcription) : undefined;
    for (const result of [p,t]) if (result && (result.audio.sha256 !== record.preparedSha256 || result.audio.durationSeconds !== record.durationSeconds)) throw Error('Response audio mismatch');
    const hyp = p?.segments.flatMap(s => {const label=phone(s.phone); return label ? [{start:s.start,end:s.end,label}] : [];}) ?? [];
    return {id:c.id,split:c.split,pass:index,phoneFailure:!!a.phoneError,whisperFailure:!!a.whisperError,
      per:alignment(ref,hyp),wer:editDistance(wordRef,words(t?.text ?? '')),unresolvedPhones:ref.filter(s=>s.label==='<unresolved-reference>').length,
      phoneMs:a.phoneMs,whisperMs:a.whisperMs,phoneRtf:a.phoneMs/1000/record.durationSeconds,whisperRtf:a.whisperMs/1000/record.durationSeconds,
      phonePredictionHash:p ? sha(JSON.stringify(p.segments)):null,transcriptHash:t ? sha(t.text):null};
  });
}
export function summarize(cases:Case[], records:NativeRecord[]) {
  if (records.length!==cases.length || new Set(records.map(r=>r.id)).size!==cases.length) throw Error('Missing/duplicate recordings');
  const scored=cases.flatMap(c=>{const r=records.find(r=>r.id===c.id);if(!r)throw Error('Missing record');return score(c,r);});
  const groups=[];
  for(const split of ['development','evaluation']) for(const pass of [0,1,2]) {
    const rows=scored.filter(r=>r.split===split&&r.pass===pass), sum=(f:(r:typeof rows[number])=>number)=>rows.reduce((n,r)=>n+f(r),0);
    groups.push({split,pass,recordings:rows.length,phoneFailures:sum(r=>+r.phoneFailure),whisperFailures:sum(r=>+r.whisperFailure),
      phones:sum(r=>r.per.reference),phoneErrors:sum(r=>r.per.errors),per:sum(r=>r.per.errors)/sum(r=>r.per.reference),
      words:sum(r=>r.wer.reference),wordErrors:sum(r=>r.wer.errors),wer:sum(r=>r.wer.errors)/sum(r=>r.wer.reference),
      unresolvedPhones:sum(r=>r.unresolvedPhones),matchedPhones:sum(r=>r.per.matchedPhones),within40ms:sum(r=>r.per.withinTolerance),
      referenceBoundaryCoverage:sum(r=>r.per.withinTolerance)/sum(r=>r.per.reference),
      meanPhoneMs:sum(r=>r.phoneMs)/rows.length,meanWhisperMs:sum(r=>r.whisperMs)/rows.length,
      meanPhoneRtf:sum(r=>r.phoneRtf)/rows.length,meanWhisperRtf:sum(r=>r.whisperRtf)/rows.length});
  }
  const repeated=cases.map(c=>{const a=scored.filter(r=>r.id===c.id);return{id:c.id,phoneEqual:a.every(r=>r.phonePredictionHash!==null&&r.phonePredictionHash===a[0].phonePredictionHash),transcriptEqual:a.every(r=>r.transcriptHash!==null&&r.transcriptHash===a[0].transcriptHash)};});
  return {protocol:AUDIO_PROTOCOL,groups,repeated,scored};
}
