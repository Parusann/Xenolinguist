import { describe, it, expect } from 'vitest';
import { downsampleTo16k, encodeWavPcm16 } from './wav-encode';

describe('downsampleTo16k', () => {
  it('halves a 32kHz buffer to 16kHz length', () => {
    const input = new Float32Array(32000).fill(0.5);
    const out = downsampleTo16k(input, 32000);
    expect(out.length).toBe(16000);
  });
  it('returns input unchanged when already 16kHz', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    expect(downsampleTo16k(input, 16000).length).toBe(3);
  });
});

describe('encodeWavPcm16', () => {
  it('produces a valid mono 16kHz RIFF/WAVE header and PCM body', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buf = encodeWavPcm16(samples, 16000);
    const view = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);       // channels = mono
    expect(view.getUint32(24, true)).toBe(16000);    // sample rate
    expect(view.getUint16(34, true)).toBe(16);       // bits per sample
    expect(buf.byteLength).toBe(44 + samples.length * 2);
  });
});
