import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(process.argv[2] ?? ''), root = process.env.XENO_RESEARCH_ROOT, ffmpeg = process.env.XENO_FFMPEG;
if (!root || !output.startsWith(root + path.sep) || !ffmpeg) throw new Error('Provide the HDD output directory and existing FFmpeg path');
const run = promisify(execFile);
if (!process.argv.includes('--render-only')) await run(process.execPath, ['--import', 'tsx', 'cloud/src/verify-web.ts', output], { env: { ...process.env, XENO_ATLAS_RECORD_DEMO: '1' },
  windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 240000 });
const entries = await readdir(path.join(output, 'video'));
// Accessibility audits create short blank scratch pages. Retain the single substantial application recording.
const videos = await Promise.all(entries.filter(entry => entry.endsWith('.webm')).map(async file => ({ file, bytes: (await stat(path.join(output, 'video', file))).size })));
const primary = videos.filter(video => video.bytes > 65536);
if (primary.length !== 1) throw new Error('Expected one substantial application recording');
const narrationRecord = JSON.parse(await readFile(path.join(output, 'narration.json'), 'utf8')), { narration } = narrationRecord;
const timestamp = value => { const ms = Math.floor(value); return new Date(ms).toISOString().slice(11, 19) + ',' + String(ms % 1000).padStart(3, '0'); };
await writeFile(path.join(output, 'narration.srt'), narration.map((item, index) => `${index + 1}\n${timestamp(item.startMs)} --> ${timestamp(item.endMs)}\n${item.text}\n`).join('\n'));
await run(ffmpeg, ['-y', '-i', path.join('video', primary[0].file), '-vf', "subtitles=narration.srt:force_style='FontName=Arial,FontSize=8,Outline=0.7,Shadow=0,MarginV=9'",
  '-c:v', 'libx264', '-threads', '4', '-preset', 'fast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
  '-metadata', 'artist=Parusan Natheeswaran', 'atlas-demo.mp4'], { cwd: output, windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 120000 });
const movie = await readFile(path.join(output, 'atlas-demo.mp4')), details = await stat(path.join(output, 'atlas-demo.mp4'));
if (details.size > 20 * 1024 * 1024) throw new Error('Recorded demo exceeds the repository artifact bound');
const manifest = { version: 'atlas-recorded-demo-1', author: 'Parusan Natheeswaran', recordedAt: narrationRecord.recordedAt, renderedAt: new Date().toISOString(),
  file: 'atlas-demo.mp4', bytes: details.size, sha256: createHash('sha256').update(movie).digest('hex'),
  application: 'Real compiled Atlas, PostgreSQL and bounded worker in a disposable fixture', fixture: 'Licensed known-English control, followed by insufficient unglossed evidence',
  narration: 'Burned-in explanatory captions, with retained SRT and transcript', paidApis: 0, modelCalls: 0,
  primaryPageVideo: primary[0].file, blankAuditPages: videos.length - 1,
  limit: 'Demonstrates workflow and provenance. Unknown natural-language decipherment and model superiority are not established.' };
await writeFile(path.join(output, 'demo-manifest.json'), JSON.stringify(manifest, null, 2));
await writeFile(path.join(output, 'transcript.md'), '# Atlas workflow demonstration\n\nAuthor: Parusan Natheeswaran\n\n' + narration.map(item => item.text).join('\n\n') + '\n');
console.log(JSON.stringify(manifest, null, 2));
