/** Extract normalized peaks from an AudioBuffer */
export function extractPeaks(audioBuffer: AudioBuffer, barCount: number = 200): number[] {
  const channelData = audioBuffer.getChannelData(0)
  const samplesPerBar = Math.floor(channelData.length / barCount)
  const peaks: number[] = []

  for (let i = 0; i < barCount; i++) {
    let max = 0
    const start = i * samplesPerBar
    for (let j = start; j < start + samplesPerBar && j < channelData.length; j++) {
      const abs = Math.abs(channelData[j])
      if (abs > max) max = abs
    }
    peaks.push(max)
  }

  // Normalize to 0-1
  const globalMax = Math.max(...peaks, 0.01)
  return peaks.map(p => p / globalMax)
}
