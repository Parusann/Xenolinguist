import { inspectPcmWav } from 'shared/audio-container';
/** Windowed-sinc low-pass resampling. Filtering before decimation suppresses aliasing. */
export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  const TARGET = 16000;
  if (!Number.isFinite(inputRate) || inputRate < 8000 || inputRate > 192000) throw new Error('Unsupported sample rate');
  if (inputRate === TARGET) return input;
  const ratio = inputRate / TARGET;
  const outLen = Math.round(input.length / ratio);
  const out = new Float32Array(outLen);
  const cutoff = Math.min(1, TARGET / inputRate) * 0.94, radius = 32;
  for (let i = 0; i < outLen; i++) {
    const position = i * ratio, center = Math.floor(position);
    let sum = 0, weights = 0;
    for (let j = Math.max(0, center - radius + 1); j <= Math.min(input.length - 1, center + radius); j++) {
      const distance = position - j, x = Math.PI * distance * cutoff;
      const weight = cutoff * (Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x) * (0.5 + 0.5 * Math.cos(Math.PI * distance / radius));
      sum += input[j] * weight; weights += weight;
    }
    out[i] = weights ? sum / weights : 0;
  }
  return out;
}

/** Encode mono Float32 PCM (-1..1) into a 16-bit PCM WAV ArrayBuffer. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

/** Decode an audio Blob, mix to mono, downsample to 16 kHz, return a WAV Blob. */
export async function blobToWav16k(blob: Blob): Promise<Blob> {
  const bytes = await blob.arrayBuffer();
  try {
    const pcm = inspectPcmWav(new Uint8Array(bytes));
    if (pcm.channels === 1 && pcm.rate === 16000) return blob;
  } catch { /* Other supported inputs need browser decoding. */ }
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(bytes);
    const ch = decoded.numberOfChannels;
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < ch; c++) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / ch;
    }
    const wav = encodeWavPcm16(downsampleTo16k(mono, decoded.sampleRate), 16000);
    return new Blob([wav], { type: 'audio/wav' });
  } finally {
    void ctx.close();
  }
}
