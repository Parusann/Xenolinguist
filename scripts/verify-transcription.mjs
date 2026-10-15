import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Independently check the actual native response against submitted audio and installed file inventory. */
export function verifyTranscription(result, wav, runtimeFiles, requestedLanguage = 'auto') {
  let bytes;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    if (wav.toString('ascii', offset, offset + 4) === 'data') bytes = size;
    offset += 8 + size + (size & 1);
  }
  assert.ok(bytes > 0);
  assert.deepEqual(result.audio, { sha256: createHash('sha256').update(wav).digest('hex'),
    sampleRate: 16000, sampleCount: bytes / 2, durationSeconds: bytes / 32000 });
  const p = result.provenance;
  assert.equal(p.version, 1); assert.equal(p.engine, 'whisper.cpp'); assert.equal(p.engineRevision, 'v1.8.6');
  assert.equal(p.modelId, 'ggml-base-q5_1'); assert.equal(p.threads, 2);
  assert.equal(p.requestedLanguage, requestedLanguage);
  assert.equal(p.decoding, 'pinned-cli-defaults'); assert.equal(p.timing, 'model-segments-not-word-alignment');
  const byFile = new Map(runtimeFiles.map(f => [f.file.replaceAll('\\', '/').split('/').at(-1), f]));
  assert.equal(p.runtimeFiles.length, 6); assert.equal(new Set(p.runtimeFiles.map(f => f.file)).size, 6);
  for (const file of p.runtimeFiles) {
    const installed = byFile.get(file.file); assert.ok(installed);
    assert.equal(file.sha256, installed.sha256); assert.equal(file.bytes, installed.bytes);
  }
  assert.equal(p.modelSha256, byFile.get('ggml-base-q5_1.bin').sha256);
  assert.equal(p.executableSha256, byFile.get('whisper-cli.exe').sha256);
  assert.equal(result.text, result.segments.map(s => s.text).join(' ').trim());
  let previous = 0;
  for (const s of result.segments) {
    assert.ok(Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= previous && s.end > s.start && s.end <= result.audio.durationSeconds);
    assert.ok(s.text.trim().length); previous = s.end;
  }
  if (requestedLanguage === 'auto') {
    assert.ok(result.languageProb === null || (Number.isFinite(result.languageProb) && result.languageProb >= 0 && result.languageProb <= 1));
    assert.equal(p.languageSelection, result.languageProb === null ? 'unreported' : 'detected');
  } else {
    assert.equal(result.language, requestedLanguage); assert.equal(result.languageProb, null); assert.equal(p.languageSelection, 'explicit');
  }
  return { passed: true, segments: result.segments.length, runtimeFiles: p.runtimeFiles.length,
    languageSelection: p.languageSelection, scope: 'Execution and provenance integrity; not transcript accuracy, calibration or word alignment.' };
}
