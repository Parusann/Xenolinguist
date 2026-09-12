/** Validate the supported original PCM container without decoding or transferring its bytes. */
export function inspectPcmWav(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== bytes.length)
    throw new Error('Invalid or truncated WAV container');
  let offset = 12, channels = 0, rate = 0, dataBytes = 0;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true), id = tag(offset);
    if (offset + 8 + size > bytes.length) throw new Error('Truncated WAV chunk');
    if (id === 'fmt ') {
      if (channels || size < 16 || view.getUint16(offset + 8, true) !== 1 || view.getUint16(offset + 22, true) !== 16)
        throw new Error('Original WAV must use PCM16');
      channels = view.getUint16(offset + 10, true); rate = view.getUint32(offset + 12, true);
      if (channels < 1 || channels > 2 || rate < 8000 || rate > 96000)
        throw new Error('WAV supports one or two channels at 8–96 kHz');
      if (view.getUint16(offset + 20, true) !== channels * 2 || view.getUint32(offset + 16, true) !== rate * channels * 2)
        throw new Error('Invalid PCM alignment or byte rate');
    }
    if (id === 'data') { if (dataBytes || !size) throw new Error('Invalid PCM data'); dataBytes = size; }
    offset += 8 + size + (size & 1);
  }
  if (!channels || !dataBytes || offset !== bytes.length || dataBytes % (channels * 2)) throw new Error('Incomplete WAV');
  const duration = dataBytes / (channels * 2 * rate);
  if (duration < 0.025 || duration > 120) throw new Error('Audio must be 25 ms–120 seconds');
  return { channels, rate, duration };
}
