import { downsampleTo16k, encodeWavPcm16 } from '../components/audio/wav-encode'
self.onmessage = (event: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => {
  try {
    const { channels, sampleRate } = event.data
    const mono = new Float32Array(channels[0].length)
    for (const channel of channels) for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length
    const peaks = Array.from({ length: 200 }, (_, index) => {
      let peak = 0
      for (let i = Math.floor(index * mono.length / 200); i < Math.floor((index + 1) * mono.length / 200); i++) peak = Math.max(peak, Math.abs(mono[i]))
      return Math.min(1, peak)
    })
    const samples = downsampleTo16k(mono, sampleRate), wav = encodeWavPcm16(samples, 16000)
    self.postMessage({ wav, peaks, duration: samples.length / 16000 }, { transfer: [wav] })
  } catch (error) { self.postMessage({ error: (error as Error).message }) }
}
