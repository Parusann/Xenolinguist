export class IpaBadInputError extends Error {
  constructor(message: string) { super(message); this.name = 'IpaBadInputError'; }
}

/** Inspect container/sample geometry without allocating decoded audio on the server thread.
 * Unsupported rates and channels fail before creating an inference process. */
export function inspectAudioWav(buf: Buffer, maxSeconds = 120) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE'
    || buf.readUInt32LE(4) + 8 !== buf.length) throw new IpaBadInputError('Invalid RIFF/WAVE size or signature');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12, dataOff = -1, dataLen = 0, sampleRate = 0, channels = 0, format = 0, bits = 0, alignment = 0, byteRate = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = dv.getUint32(off + 4, true);
    if (off + 8 + sz > buf.length) throw new IpaBadInputError('Truncated WAV chunk');
    if (id === 'fmt ') {
      if (sz < 16 || format) throw new IpaBadInputError('Invalid or repeated WAV format');
      format = dv.getUint16(off + 8, true); channels = dv.getUint16(off + 10, true); sampleRate = dv.getUint32(off + 12, true);
      byteRate = dv.getUint32(off + 16, true); alignment = dv.getUint16(off + 20, true); bits = dv.getUint16(off + 22, true);
    }
    if (id === 'data') { if (dataOff >= 0) throw new IpaBadInputError('Repeated WAV data'); dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz & 1);
  }
  if (off !== buf.length || dataOff < 0 || dataLen < 800 || dataLen % 2 || dataLen > 16000 * 2 * maxSeconds) throw new IpaBadInputError(`WAV must contain 25 ms to ${maxSeconds} seconds of complete PCM samples`);
  if (format !== 1 || bits !== 16 || alignment !== 2 || byteRate !== 32000 || sampleRate !== 16000 || channels !== 1)
    throw new IpaBadInputError('Expected mono PCM16 WAV at 16000 Hz');
  return { sampleCount: dataLen / 2, dataOffset: dataOff, durationSeconds: dataLen / 32000 };
}
