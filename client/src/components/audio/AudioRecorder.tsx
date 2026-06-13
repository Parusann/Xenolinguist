import { useState, useRef, useCallback, useEffect } from 'react'
import { WaveformCanvas, extractPeaks } from './WaveformCanvas'
import { useLanguageDetection, LanguageBadge } from './LanguageDetector'
import { transcribePhones as transcribeIpa } from '@/services/ipa'
import type { SttSegment } from 'shared/types'

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob, peaks: number[], duration: number, detectedLanguage?: string, segments?: SttSegment[], mode?: 'transcription' | 'phonetic-guess', ipa?: string) => void
  className?: string
}

export function AudioRecorder({ onRecordingComplete, className = '' }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [livePeaks, setLivePeaks] = useState<number[]>([])
  const [duration, setDuration] = useState(0)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const { detect, detecting, result: langResult, reset: resetLang } = useLanguageDetection()

  // Live speech recognition during recording
  const liveRecognitionRef = useRef<any>(null)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [liveLanguage, setLiveLanguage] = useState<string | null>(null)

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (liveRecognitionRef.current) {
      try { liveRecognitionRef.current.stop() } catch {}
      liveRecognitionRef.current = null
    }
    cancelAnimationFrame(animFrameRef.current)
    setRecording(false)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      resetLang()
      setLiveTranscript('')
      setLiveLanguage(null)

      // Set up analyser for live waveform
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // Start live speech recognition for real-time language detection
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.maxAlternatives = 1

        recognition.onresult = (event: any) => {
          let transcript = ''
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript
          }
          setLiveTranscript(transcript)

          // If we got a final result with decent confidence, try to identify the language
          const lastResult = event.results[event.results.length - 1]
          if (lastResult.isFinal && lastResult[0].confidence > 0.5) {
            // The default recognition lang is browser locale — if it recognized text,
            // that's likely the spoken language
            const browserLang = navigator.language.split('-')[0]
            const langMap: Record<string, string> = {
              en: 'English', es: 'Spanish', fr: 'French', de: 'German',
              it: 'Italian', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese',
              ko: 'Korean', zh: 'Chinese', ar: 'Arabic', hi: 'Hindi',
              nl: 'Dutch', sv: 'Swedish', pl: 'Polish', tr: 'Turkish',
            }
            setLiveLanguage(langMap[browserLang] || browserLang)
          }
        }

        recognition.onerror = () => {}
        try {
          recognition.start()
          liveRecognitionRef.current = recognition
        } catch {}
      }

      // Set up MediaRecorder
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const dur = (Date.now() - startTimeRef.current) / 1000

        // Decode for peaks
        const arrayBuf = await blob.arrayBuffer()
        const decoded = await audioCtx.decodeAudioData(arrayBuf)
        const peaks = extractPeaks(decoded, 200)

        audioCtx.close()

        // Run language detection and IPA phone recognition in parallel
        const [det, ipa] = await Promise.all([detect(blob), transcribeIpa(blob)])
        onRecordingComplete(blob, peaks, dur, det?.language || liveLanguage || undefined, det?.segments, det?.mode, ipa ?? undefined)
      }

      recorder.start(100)
      startTimeRef.current = Date.now()
      mediaRecorder.current = recorder
      setRecording(true)
      setLivePeaks([])

      // Animate live waveform
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const drawLive = () => {
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
      console.error('Microphone access denied:', err)
    }
  }, [onRecordingComplete, detect, resetLang, liveLanguage])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      if (liveRecognitionRef.current) {
        try { liveRecognitionRef.current.stop() } catch {}
      }
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

      {/* Live transcript during recording */}
      {recording && liveTranscript && (
        <div className="glass-inner rounded-lg px-3 py-2 border border-white/[0.04]">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-1 rounded-full bg-accent animate-pulse" />
            <span className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">Live Transcript</span>
            {liveLanguage && (
              <span className="text-[10px] font-mono text-accent/70">({liveLanguage})</span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 font-mono leading-relaxed truncate">{liveTranscript}</p>
        </div>
      )}

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

      {/* Language detection result */}
      <LanguageBadge result={langResult} detecting={detecting} />
    </div>
  )
}
