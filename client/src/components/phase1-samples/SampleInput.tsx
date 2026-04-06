import { useState } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'
import { useAutoSuggest } from '@/hooks/useAutoSuggest'
import { useUndo } from '@/stores/undo-context'
import { SOURCE_PRESETS } from 'shared/constants'
import { formatDictionaryForPrompt, formatSamplesForPrompt } from 'shared/prompts'
import { AudioRecorder } from '@/components/audio/AudioRecorder'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { SampleDecodeView } from '@/components/phase1-samples/SampleDecodeView'
import { ContextMenu, type ContextMenuItem } from '@/components/layout/ContextMenu'
import type { Sample } from 'shared/types'

export function SampleInput() {
  const { profile, addSample, removeSample, addAudioClip, addDictionaryEntry } = useProfile()
  const { runTask, loading, streamedText } = useAI()
  const { connected } = useOllama()
  const { suggestForSample } = useAutoSuggest()
  const { pushAction } = useUndo()
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sample: Sample } | null>(null)
  const [autoSuggestion, setAutoSuggestion] = useState('')
  const [alienText, setAlienText] = useState('')
  const [translation, setTranslation] = useState('')
  const [source, setSource] = useState<string>(SOURCE_PRESETS[0])
  const [phoneticNotes, setPhoneticNotes] = useState('')
  const [parallelMode, setParallelMode] = useState(false)
  const [analysisResult, setAnalysisResult] = useState('')
  const [showRecorder, setShowRecorder] = useState(false)
  const [pendingAudio, setPendingAudio] = useState<{
    blob: Blob; peaks: number[]; duration: number; blobUrl: string; detectedLanguage?: string
  } | null>(null)

  const handleAdd = async () => {
    if (!alienText.trim() && !pendingAudio) return

    let audioId: string | null = null

    // Upload audio if present
    if (pendingAudio) {
      const clipId = addAudioClip({
        filename: '',
        duration: pendingAudio.duration,
        waveform: pendingAudio.peaks,
        segments: [],
      })
      audioId = clipId

      // Upload to server
      const arrayBuf = await pendingAudio.blob.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuf).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      fetch('/api/audio/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: clipId,
          data: base64,
          mimeType: pendingAudio.blob.type,
        }),
      }).catch(console.error)
    }

    const sampleText = alienText.trim() || '[audio sample]'
    addSample({
      alien_text: sampleText,
      english_translation: parallelMode && translation.trim() ? translation.trim() : null,
      source: pendingAudio ? 'Audio recording' : source,
      phonetic_notes: phoneticNotes.trim(),
      decoded: false,
      audio_id: audioId,
    })

    // Trigger auto-suggestion if dictionary has entries
    if (profile && profile.dictionary.length > 0 && sampleText !== '[audio sample]') {
      suggestForSample(sampleText, profile.dictionary, setAutoSuggestion)
    }

    setAlienText('')
    setTranslation('')
    setPhoneticNotes('')
    setPendingAudio(null)
    setShowRecorder(false)
  }

  const handleRecordingComplete = (blob: Blob, peaks: number[], duration: number, detectedLanguage?: string) => {
    const blobUrl = URL.createObjectURL(blob)
    setPendingAudio({ blob, peaks, duration, blobUrl, detectedLanguage })
    setSource('Audio recording')
    if (detectedLanguage) {
      setPhoneticNotes(prev => prev ? prev : `Detected: ${detectedLanguage}`)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const arrayBuf = await file.arrayBuffer()
    const audioCtx = new AudioContext()
    const decoded = await audioCtx.decodeAudioData(arrayBuf)

    const { extractPeaks } = await import('@/components/audio/WaveformCanvas')
    const peaks = extractPeaks(decoded, 200)
    const duration = decoded.duration
    const blob = new Blob([arrayBuf], { type: file.type })
    const blobUrl = URL.createObjectURL(blob)

    setPendingAudio({ blob, peaks, duration, blobUrl })
    setSource('Audio recording')
    audioCtx.close()
  }

  const handleAnalyze = async () => {
    if (!profile) return
    const prompt = `Current dictionary:\n${formatDictionaryForPrompt(profile.dictionary)}\n\nSamples:\n${formatSamplesForPrompt(profile.samples)}`
    const result = await runTask('patternAnalysis', prompt)
    setAnalysisResult(result)
  }

  // Find audio clip data for a sample
  const getAudioForSample = (audioId: string | null) => {
    if (!audioId || !profile) return null
    return (profile.audio_clips || []).find(c => c.id === audioId) || null
  }

  const handleSampleContextMenu = (e: React.MouseEvent, sample: Sample) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, sample })
  }

  const handleDeleteWithUndo = (sample: Sample) => {
    removeSample(sample.id)
    pushAction({
      description: `Removed sample '${sample.alien_text.slice(0, 30)}${sample.alien_text.length > 30 ? '...' : ''}'`,
      undo: () => {
        addSample({
          alien_text: sample.alien_text,
          english_translation: sample.english_translation,
          source: sample.source,
          phonetic_notes: sample.phonetic_notes,
          decoded: sample.decoded,
          audio_id: sample.audio_id,
        })
      },
    })
  }

  const getSampleContextMenuItems = (sample: Sample): ContextMenuItem[] => [
    {
      label: 'Decode Sample',
      icon: '\u{1F50D}',
      onClick: () => setSelectedSample(sample),
    },
    {
      label: 'Copy Text',
      icon: '\u{1F4CB}',
      onClick: () => navigator.clipboard.writeText(sample.alien_text),
    },
    { label: '---', onClick: () => {} },
    {
      label: 'Delete Sample',
      icon: '\u{1F5D1}',
      danger: true,
      onClick: () => handleDeleteWithUndo(sample),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-light mb-1 text-chrome">Language <span className="font-medium text-chrome-accent">Samples</span></h2>
          <p className="text-xs text-gray-500">Input samples of the unknown language for pattern analysis.</p>
        </div>
        {profile && profile.samples.length > 0 && (
          <button
            onClick={handleAnalyze}
            disabled={!connected || loading}
            className="btn-primary text-xs"
          >
            {loading ? 'Analyzing...' : 'Analyze Patterns'}
          </button>
        )}
      </div>

      {/* Two-column: Form left, Sample list right */}
      <div className="grid grid-cols-5 gap-4 items-start">
        {/* Left column: New Sample form */}
        <div className="col-span-2 glass-card rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0">New Sample</label>
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={parallelMode}
                onChange={(e) => setParallelMode(e.target.checked)}
                className="accent-accent w-3 h-3"
              />
              Parallel mode
            </label>
          </div>

          <div className={parallelMode ? 'grid grid-cols-2 gap-3' : ''}>
            <div>
              <textarea
                value={alienText}
                onChange={(e) => setAlienText(e.target.value)}
                placeholder="Enter unknown language text..."
                rows={3}
                className="input input-mono w-full resize-none"
              />
            </div>
            {parallelMode && (
              <div>
                <textarea
                  value={translation}
                  onChange={(e) => setTranslation(e.target.value)}
                  placeholder="Known English translation..."
                  rows={3}
                  className="input w-full resize-none"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="input w-full"
              >
                {SOURCE_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="Audio recording">Audio recording</option>
              </select>
            </div>
            <div>
              <label className="label">Phonetic Notes</label>
              <input
                type="text"
                value={phoneticNotes}
                onChange={(e) => setPhoneticNotes(e.target.value)}
                placeholder="Optional"
                className="input w-full"
              />
            </div>
          </div>

          {/* Audio controls inline */}
          <div className="flex items-center gap-3">
            <button onClick={handleAdd} disabled={!alienText.trim() && !pendingAudio} className="btn-primary text-xs">
              Add Sample
            </button>
            <div className="separator-vertical h-4 w-px bg-white/[0.06]" />
            <button
              onClick={() => setShowRecorder(!showRecorder)}
              className={`btn-ghost text-xs flex items-center gap-1.5 ${showRecorder ? 'text-accent border-accent/20' : ''}`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500/70 inline-block" />
              {showRecorder ? 'Hide Recorder' : 'Record'}
            </button>
            <label className="btn-ghost text-xs cursor-pointer">
              Upload
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {showRecorder && (
            <AudioRecorder onRecordingComplete={handleRecordingComplete} />
          )}

          {/* Pending audio preview */}
          {pendingAudio && (
            <div className="glass-inner rounded-lg p-3 border border-accent/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-accent/60">
                  Recorded · {pendingAudio.duration.toFixed(1)}s
                  {pendingAudio.detectedLanguage && (
                    <span className="ml-2 text-accent"> · {pendingAudio.detectedLanguage}</span>
                  )}
                </span>
                <button
                  onClick={() => { URL.revokeObjectURL(pendingAudio.blobUrl); setPendingAudio(null) }}
                  className="text-xs text-gray-700 hover:text-red-400 transition-colors"
                >×</button>
              </div>
              <AudioPlayer
                src={pendingAudio.blobUrl}
                peaks={pendingAudio.peaks}
                duration={pendingAudio.duration}
                compact
              />
            </div>
          )}
        </div>

        {/* Right column: Collected Samples or Decode View */}
        <div className="col-span-3">
          {selectedSample && profile ? (
            <SampleDecodeView
              sample={selectedSample}
              dictionary={profile.dictionary}
              onClose={() => setSelectedSample(null)}
              onDefineWord={(entry) => {
                addDictionaryEntry(entry)
                // Refresh selectedSample reference so decode view re-renders with updated dictionary
              }}
            />
          ) : profile && profile.samples.length > 0 ? (
            <div>
              <label className="label mb-2">Collected Samples · {profile.samples.length}</label>
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 stagger-children">
                {profile.samples.map((sample) => {
                  const audioClip = getAudioForSample(sample.audio_id)
                  return (
                    <div
                      key={sample.id}
                      className="glass-card rounded-lg p-3 group cursor-pointer"
                      onClick={() => setSelectedSample(sample)}
                      onContextMenu={(e) => handleSampleContextMenu(e, sample)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3">
                            <p className="text-sm font-mono text-gray-200 break-all leading-relaxed flex-1">{sample.alien_text}</p>
                            <div className="flex gap-2 flex-shrink-0 items-center">
                              <span className="badge badge-probable">{sample.source}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteWithUndo(sample) }}
                                className="text-xs text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                          {sample.english_translation && (
                            <p className="text-xs text-accent/60 mt-1 flex items-center gap-1.5">
                              <span className="text-accent/30">→</span> {sample.english_translation}
                            </p>
                          )}
                          {audioClip && (
                            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                              <AudioPlayer
                                src={`/api/audio/${audioClip.id}`}
                                peaks={audioClip.waveform}
                                duration={audioClip.duration}
                                compact
                              />
                            </div>
                          )}
                          {sample.phonetic_notes && (
                            <span className="text-[10px] text-gray-600 italic mt-1 inline-block">{sample.phonetic_notes}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-xl p-8 flex items-center justify-center h-full">
              <p className="text-sm text-gray-700">No samples yet. Add your first sample using the form.</p>
            </div>
          )}
        </div>
      </div>

      {/* Auto-suggestion — appears briefly after adding a sample */}
      {autoSuggestion && (
        <div className="glass-card rounded-xl p-4 animate-slide-up border border-accent/10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent/60" />
              <label className="label mb-0 text-accent">Quick Analysis</label>
            </div>
            <button
              onClick={() => setAutoSuggestion('')}
              className="text-xs text-gray-700 hover:text-gray-400 transition-colors"
            >Dismiss</button>
          </div>
          <pre className="text-[12px] text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">{autoSuggestion}</pre>
        </div>
      )}

      {/* AI Analysis — full width below */}
      {(loading || analysisResult) && (
        <div className={`glass-card rounded-xl p-5 ${loading ? 'scan-overlay' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-accent animate-pulse' : 'bg-accent/40'}`} />
            <label className="label mb-0 text-accent">
              {loading ? 'Analyzing' : 'Analysis Results'}
            </label>
          </div>
          {loading && (
            <div className="relative h-0.5 bg-white/[0.03] rounded overflow-hidden mb-4">
              <div className="absolute inset-y-0 w-1/3 bg-accent/40 rounded animate-scan" />
            </div>
          )}
          <pre className="text-[13px] text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
            {loading ? streamedText : analysisResult}
          </pre>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getSampleContextMenuItems(contextMenu.sample)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
