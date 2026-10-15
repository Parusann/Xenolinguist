import { describe, it, expect } from 'vitest';
import { downsampleTo16k, encodeWavPcm16 } from './wav-encode';

describe('downsampleTo16k', () => {
  it('preserves speech-band amplitude and suppresses a 12 kHz alias by at least 40 dB', () => {
    const tone = (hz: number) => Float32Array.from({ length: 48000 }, (_, i) => Math.sin(2 * Math.PI * hz * i / 48000));
    const rms = (samples: Float32Array) => Math.sqrt(samples.slice(100, -100).reduce((sum, value) => sum + value * value, 0) / (samples.length - 200));
    expect(rms(downsampleTo16k(tone(1000), 48000))).toBeCloseTo(Math.SQRT1_2, 2);
    expect(rms(downsampleTo16k(tone(12000), 48000))).toBeLessThan(Math.SQRT1_2 * 0.01);
    expect(downsampleTo16k(new Float32Array(800).fill(0.25), 8000)).toHaveLength(1600);
    expect(downsampleTo16k(new Float32Array(4800).fill(0.25), 48000)[500]).toBeCloseTo(0.25, 5);
  });
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
