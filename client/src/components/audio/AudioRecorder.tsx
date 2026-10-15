import { useState, useRef, useCallback, useEffect } from 'react'
import { WaveformCanvas } from './WaveformCanvas'

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void
  className?: string
}

export function AudioRecorder({ onRecordingComplete, className = '' }: AudioRecorderProps) {
  const [recordingError, setRecordingError] = useState('')
  const [recording, setRecording] = useState(false)
  const [livePeaks, setLivePeaks] = useState<number[]>([])
  const [duration, setDuration] = useState(0)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    cancelAnimationFrame(animFrameRef.current)
    setRecording(false)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setRecordingError('')

      // Set up analyser for live waveform
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (audioCtx.state !== 'closed') void audioCtx.close()
        audioCtxRef.current = null
        onRecordingComplete(blob)
      }

      recorder.start(100)
      startTimeRef.current = Date.now()
      mediaRecorder.current = recorder
      setRecording(true)
      setLivePeaks([])

      // Animate live waveform
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const drawLive = () => {
        if ((Date.now() - startTimeRef.current) / 1000 >= 119) { stopRecording(); return }
        analyser.getByteTimeDomainData(dataArray)

        let max = 0
        for (let i = 0; i < dataArray.length; i++) {
          const v = Math.abs(dataArray[i] - 128) / 128
          if (v > max) max = v
        }

        setLivePeaks(prev => {
          const next = [...prev, max]
          return next.length > 200 ? next.slice(-200) : next
        })

        setDuration((Date.now() - startTimeRef.current) / 1000)
        animFrameRef.current = requestAnimationFrame(drawLive)
      }
      drawLive()
    } catch (err) {
      streamRef.current?.getTracks().forEach(track => track.stop())
      if (audioCtxRef.current?.state !== 'closed') void audioCtxRef.current?.close()
      setRecordingError('Recording could not start. Check microphone access and WebM/Opus support.')
      console.error('Microphone access denied:', err)
    }
  }, [onRecordingComplete, stopRecording])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close()
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className={`glass-card rounded-xl p-4 space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="label mb-0">Audio Recorder</label>
        {recording && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-mono text-red-400">{formatTime(duration)}</span>
          </div>
        )}
      </div>

      {/* Live waveform */}
      <div className="glass-inner rounded-lg p-2.5 border border-white/[0.03]">
        {livePeaks.length > 0 ? (
          <WaveformCanvas peaks={livePeaks} progress={null} height={48} />
        ) : (
          <div className="flex items-center justify-center h-[48px] text-gray-700 text-[11px] font-mono">
            {recording ? 'Listening...' : 'Click record to capture audio'}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">Recording stays local. Choose Transcribe after recording to run local analysis.</p>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {!recording ? (
          <button onClick={startRecording} className="btn-primary text-xs flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            Record
          </button>
        ) : (
          <button onClick={stopRecording} className="btn-primary text-xs flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-accent inline-block" />
            Stop
          </button>
        )}
      </div>

      {recordingError && <p role="alert" className="text-xs text-amber-300">{recordingError}</p>}
    </div>
  )
}
