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
import { AudioSegmenter } from '@/components/audio/AudioSegmenter'
import { SampleDecodeView } from '@/components/phase1-samples/SampleDecodeView'
import { ContextMenu, type ContextMenuItem } from '@/components/layout/ContextMenu'
import type { Sample, SttSegment } from 'shared/types'

export function SampleInput() {
  const { profile, addSample, removeSample, addAudioClip, addDictionaryEntry, updateSample } = useProfile()
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
  const [filter, setFilter] = useState<'all' | 'decoded' | 'audio'>('all')
  const [search, setSearch] = useState('')
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob; peaks: number[]; duration: number; blobUrl: string; detectedLanguage?: string; sttSegments?: SttSegment[]; mode?: 'transcription' | 'phonetic-guess' } | null>(null)
  const [pendingSegments, setPendingSegments] = useState<{ id: string; start: number; end: number; label: string }[]>([])
  const [reTranscribing, setReTranscribing] = useState<string | null>(null)

  const samples = profile?.samples || []

  const handleAdd = async () => {
    if (!alienText.trim() && !pendingAudio) return
    let audioId: string | null = null
    if (pendingAudio) {
      const clipId = addAudioClip({ filename: '', duration: pendingAudio.duration, waveform: pendingAudio.peaks, segments: pendingSegments.map((s) => ({ id: s.id, start: s.start, end: s.end, label: s.label, dictionary_entry_id: null })) })
      audioId = clipId
      const arrayBuf = await pendingAudio.blob.arrayBuffer()
      const base64 = btoa(new Uint8Array(arrayBuf).reduce((data, byte) => data + String.fromCharCode(byte), ''))
      fetch('/api/audio/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: clipId, data: base64, mimeType: pendingAudio.blob.type }) }).catch(console.error)
    }
    const sampleText = alienText.trim() || '[audio sample]'
    addSample({ alien_text: sampleText, english_translation: parallelMode && translation.trim() ? translation.trim() : null, source: pendingAudio ? 'Audio recording' : source, phonetic_notes: phoneticNotes.trim(), decoded: false, audio_id: audioId, ipa: null })
    if (profile && profile.dictionary.length > 0 && sampleText !== '[audio sample]') {
      suggestForSample(sampleText, profile.dictionary, setAutoSuggestion)
    }
    setAlienText('')
    setTranslation('')
    setPhoneticNotes('')
    setPendingAudio(null)
    setPendingSegments([])
    setShowRecorder(false)
  }

  const handleRecordingComplete = (blob: Blob, peaks: number[], duration: number, detectedLanguage?: string, segments?: SttSegment[], mode?: 'transcription' | 'phonetic-guess') => {
    const blobUrl = URL.createObjectURL(blob)
    setPendingAudio({ blob, peaks, duration, blobUrl, detectedLanguage, sttSegments: segments, mode })
    setPendingSegments((segments ?? []).map((s, i) => ({ id: `stt-${i}`, start: s.start, end: s.end, label: s.text })))
    setSource('Audio recording')
    if (detectedLanguage) setPhoneticNotes((prev) => prev || `Detected: ${detectedLanguage}`)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const arrayBuf = await file.arrayBuffer()
    const audioCtx = new AudioContext()
    const decoded = await audioCtx.decodeAudioData(arrayBuf)
    const { extractPeaks } = await import('@/components/audio/WaveformCanvas')
    const peaks = extractPeaks(decoded, 200)
    const blob = new Blob([arrayBuf], { type: file.type })
    setPendingAudio({ blob, peaks, duration: decoded.duration, blobUrl: URL.createObjectURL(blob) })
    setSource('Audio recording')
    audioCtx.close()
  }

  const handleAnalyze = async () => {
    if (!profile) return
    const prompt = `Current dictionary:\n${formatDictionaryForPrompt(profile.dictionary)}\n\nSamples:\n${formatSamplesForPrompt(profile.samples)}`
    setAnalysisResult(await runTask('patternAnalysis', prompt))
  }

  const getAudioForSample = (audioId: string | null) => (!audioId || !profile ? null : (profile.audio_clips || []).find((c) => c.id === audioId) || null)

  const handleReTranscribe = async (sample: Sample) => {
    if (!sample.audio_id) return
    setReTranscribing(sample.id)
    try {
      const res = await fetch(`/api/audio/${sample.audio_id}`)
      if (!res.ok) return
      const blob = await res.blob()
      const { transcribe } = await import('@/services/stt')
      const stt = await transcribe(blob)
      if (stt) {
        const label = stt.mode === 'transcription' ? 'Transcript' : 'Phonetic guess'
        updateSample(sample.id, { phonetic_notes: `${label}: ${stt.text}` })
      }
    } finally {
      setReTranscribing(null)
    }
  }

  const handleDeleteWithUndo = (sample: Sample) => {
    removeSample(sample.id)
    pushAction({
      description: `Removed sample '${sample.alien_text.slice(0, 30)}${sample.alien_text.length > 30 ? '…' : ''}'`,
      undo: () => addSample({ alien_text: sample.alien_text, english_translation: sample.english_translation, source: sample.source, phonetic_notes: sample.phonetic_notes, decoded: sample.decoded, audio_id: sample.audio_id, ipa: sample.ipa }),
    })
  }

  const getSampleContextMenuItems = (sample: Sample): ContextMenuItem[] => [
    { label: 'Decode Sample', icon: '\u{1F50D}', onClick: () => setSelectedSample(sample) },
    { label: 'Copy Text', icon: '\u{1F4CB}', onClick: () => navigator.clipboard.writeText(sample.alien_text) },
    { label: '---', onClick: () => {} },
    { label: 'Delete Sample', icon: '\u{1F5D1}', danger: true, onClick: () => handleDeleteWithUndo(sample) },
  ]

  const decodedCount = samples.filter((s) => s.decoded).length
  const visible = samples.filter((s) => {
    if (filter === 'decoded' && !s.decoded) return false
    if (filter === 'audio' && !s.audio_id) return false
    if (search && !s.alien_text.toLowerCase().includes(search.toLowerCase()) && !(s.english_translation || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="phase-enter" style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 560px) 1fr', gap: 20, height: '100%', overflow: 'hidden' }}>
      {/* LEFT — capture */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto', paddingRight: 4 }}>
        <div>
          <div className="flex" style={{ alignItems: 'baseline', gap: 12 }}>
            <h1 className="h-display" style={{ margin: 0, fontSize: 30 }}>Language <em>Samples</em></h1>
            <span className="kicker">PHASE 01</span>
          </div>
          <p className="dim" style={{ marginTop: 6, fontSize: 13 }}>Capture raw alien text. Tag the source, add phonetic notes, attach audio.</p>
        </div>

        <div className="glass-card" style={{ padding: 18 }}>
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="label" style={{ marginBottom: 0 }}>New Sample</span>
            <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--fg-dim)', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={parallelMode} onChange={(e) => setParallelMode(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 13, height: 13 }} />
              Parallel mode
            </label>
          </div>

          <textarea className="textarea" value={alienText} onChange={(e) => setAlienText(e.target.value)} placeholder="Enter unknown language text… e.g. nesh tor krash." style={{ marginTop: 12, minHeight: 96, fontSize: 15 }} />
          {parallelMode && (
            <textarea className="textarea" value={translation} onChange={(e) => setTranslation(e.target.value)} placeholder="Known English translation…" style={{ marginTop: 10, minHeight: 60, fontFamily: 'var(--font-sans)' }} />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <label className="label">Source</label>
              <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="Audio recording">Audio recording</option>
              </select>
            </div>
            <div>
              <label className="label">Phonetic Notes</label>
              <input className="input" value={phoneticNotes} onChange={(e) => setPhoneticNotes(e.target.value)} placeholder="IPA, tone markers" />
            </div>
          </div>

          <div className="flex" style={{ gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn primary sm" onClick={handleAdd} disabled={!alienText.trim() && !pendingAudio}>Add Sample</button>
            <button className="btn sm ghost" onClick={() => setShowRecorder((v) => !v)} style={{ color: showRecorder ? 'var(--accent)' : undefined }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--conf-unknown)', display: 'inline-block' }} />
              {showRecorder ? 'Hide Recorder' : 'Record'}
            </button>
            <label className="btn sm ghost" style={{ cursor: 'pointer' }}>
              ↑ Upload
              <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
            </label>
            <div className="flex-1" />
            <button className="btn sm ghost" onClick={handleAnalyze} disabled={!connected || loading || !samples.length}>{loading ? 'Analyzing…' : '⌖ AI Auto-decode'}</button>
          </div>

          {showRecorder && <div style={{ marginTop: 12 }}><AudioRecorder onRecordingComplete={handleRecordingComplete} /></div>}

          {pendingAudio && (
            <div className="glass-inner" style={{ padding: 12, marginTop: 12 }}>
              <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="font-mono" style={{ fontSize: 10, color: 'var(--accent)' }}>Recorded · {pendingAudio.duration.toFixed(1)}s{pendingAudio.detectedLanguage ? ` · ${pendingAudio.detectedLanguage}` : ''}</span>
                <button onClick={() => { URL.revokeObjectURL(pendingAudio.blobUrl); setPendingAudio(null) }} style={{ background: 'none', border: 0, color: 'var(--fg-mute)', cursor: 'pointer' }}>×</button>
              </div>
              <AudioPlayer src={pendingAudio.blobUrl} peaks={pendingAudio.peaks} duration={pendingAudio.duration} compact />
              {pendingAudio.sttSegments && pendingAudio.sttSegments.length > 0 && (
                <AudioSegmenter
                  key={pendingAudio.blobUrl}
                  src={pendingAudio.blobUrl}
                  peaks={pendingAudio.peaks}
                  duration={pendingAudio.duration}
                  initialSegments={pendingAudio.sttSegments.map((s, i) => ({
                    id: `stt-${i}`,
                    start: s.start / pendingAudio.duration,
                    end: s.end / pendingAudio.duration,
                    label: s.text,
                  }))}
                  onSegmentsChange={setPendingSegments}
                />
              )}
              {pendingAudio.mode === 'transcription' && pendingSegments.length > 0 && (
                <div className="glass-inner" style={{ padding: 10, marginTop: 10 }}>
                  <span className="label" style={{ marginBottom: 6, display: 'block' }}>Link to dictionary</span>
                  <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {pendingSegments.map((s) => {
                      const known = profile?.dictionary.find((d) => d.alien_word.toLowerCase() === s.label.toLowerCase())
                      return (
                        <button
                          key={s.id}
                          className="btn xs ghost"
                          title={known ? `Already in dictionary: ${known.english_meaning}` : 'Add to dictionary'}
                          style={{ color: known ? 'var(--accent)' : undefined }}
                          onClick={() => {
                            if (known || !s.label.trim()) return
                            addDictionaryEntry({ alien_word: s.label, english_meaning: '', part_of_speech: 'unknown', confidence: 50, context: 'From audio transcript', examples: [], notes: '' })
                          }}
                        >
                          {known ? `✓ ${s.label}` : `+ ${s.label}`}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {autoSuggestion && (
          <div className="glass-card slide-up" style={{ padding: 14 }}>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="flex" style={{ gap: 8, alignItems: 'center' }}><span className="dot" style={{ background: 'var(--ai)', boxShadow: '0 0 6px var(--ai)' }} /><span className="label" style={{ color: 'var(--ai)', marginBottom: 0 }}>Quick Analysis</span></div>
              <button onClick={() => setAutoSuggestion('')} style={{ background: 'none', border: 0, color: 'var(--fg-mute)', fontSize: 11, cursor: 'pointer' }}>Dismiss</button>
            </div>
            <pre style={{ fontSize: 12, color: 'var(--fg-1)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.6, margin: 0 }}>{autoSuggestion}</pre>
          </div>
        )}

        {(loading || analysisResult) && (
          <div className={`glass-card ${loading ? 'scan-overlay' : ''}`} style={{ padding: 14 }}>
            <div className="flex" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}><span className="dot" style={{ background: 'var(--ai)', boxShadow: '0 0 6px var(--ai)' }} /><span className="label" style={{ color: 'var(--ai)', marginBottom: 0 }}>{loading ? 'Analyzing Patterns' : 'AI Analysis'}</span></div>
            <pre style={{ fontSize: 12.5, color: 'var(--fg-1)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.6, margin: 0 }}>{loading ? streamedText : analysisResult}</pre>
          </div>
        )}
      </div>

      {/* RIGHT — samples list / decode view */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        {selectedSample && profile ? (
          <SampleDecodeView sample={selectedSample} dictionary={profile.dictionary} onClose={() => setSelectedSample(null)} onDefineWord={(entry) => addDictionaryEntry(entry)} />
        ) : (
          <>
            <div className="flex" style={{ gap: 10, alignItems: 'center' }}>
              <span className="label" style={{ marginBottom: 0 }}>Samples</span>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fg-mute)' }}>{samples.length} total · {decodedCount} decoded</span>
              <div className="flex-1" />
              <input className="input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 180, padding: '6px 10px' }} />
              {(['all', 'decoded', 'audio'] as const).map((f) => (
                <button key={f} className="btn xs ghost" onClick={() => setFilter(f)} style={{ background: filter === f ? 'rgba(0,230,118,0.10)' : 'transparent', color: filter === f ? 'var(--accent)' : 'var(--fg-dim)', textTransform: 'capitalize' }}>{f === 'audio' ? 'With audio' : f}</button>
              ))}
            </div>

            {samples.length === 0 ? (
              <div className="glass-card" style={{ padding: 32, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>No samples yet. Capture your first sample using the form.</div>
            ) : (
              <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4, paddingBottom: 10 }}>
                {visible.map((sample, i) => {
                  const clip = getAudioForSample(sample.audio_id)
                  return (
                    <div key={sample.id} className="glass-card" style={{ padding: 14, cursor: 'pointer' }} onClick={() => setSelectedSample(sample)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, sample }) }}>
                      <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8, alignItems: 'center', gap: 8 }}>
                        <div className="flex" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="badge" style={{ fontSize: 9 }}>S{String(i + 1).padStart(2, '0')}</span>
                          <span className={'badge ' + (sample.decoded ? 'confirmed' : 'unknown')}>{sample.decoded ? 'decoded' : 'raw'}</span>
                          <span className="badge" style={{ fontSize: 9 }}>{sample.source}</span>
                          {sample.audio_id && <span className="badge" style={{ fontSize: 9 }}>♪ audio</span>}
                        </div>
                        <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
                          <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-mute)' }}>{new Date(sample.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}</span>
                          {sample.audio_id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleReTranscribe(sample) }}
                              title="Re-transcribe audio"
                              style={{ background: 'none', border: 0, color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12 }}
                            >
                              {reTranscribing === sample.id ? '…' : '↻'}
                            </button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteWithUndo(sample) }} style={{ background: 'none', border: 0, color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 13 }}>×</button>
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color: 'var(--fg)', letterSpacing: '-0.005em', lineHeight: 1.4 }}>{sample.alien_text}</div>
                      {sample.english_translation && <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--fg-dim)', marginTop: 4 }}>→ {sample.english_translation}</div>}
                      {(sample.phonetic_notes || clip) && (
                        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                          <span className="font-mono" style={{ fontSize: 11, color: 'var(--fg-mute)' }}>{sample.phonetic_notes}</span>
                          {clip && (
                            <div className="wave-mini" style={{ width: 180 }} onClick={(e) => e.stopPropagation()}>
                              {clip.waveform.slice(0, 60).map((v, j) => <span key={j} style={{ height: `${Math.max(2, v * 22)}px` }} />)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={getSampleContextMenuItems(contextMenu.sample)} onClose={() => setContextMenu(null)} />}
    </div>
  )
}
