import { useEffect, useRef, useState, type SetStateAction } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'
import { useAutoSuggest } from '@/hooks/useAutoSuggest'
import { useUndo } from '@/stores/undo-context'
import { useSessionLog } from '@/stores/session-log-context'
import { SOURCE_PRESETS } from 'shared/constants'
import { formatDictionaryForPrompt, formatSamplesForPrompt } from 'shared/prompts'
import { AudioRecorder } from '@/components/audio/AudioRecorder'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { AudioSegmenter } from '@/components/audio/AudioSegmenter'
import { SampleDecodeView } from '@/components/phase1-samples/SampleDecodeView'
import { ContextMenu, type ContextMenuItem } from '@/components/layout/ContextMenu'
import type { Sample } from 'shared/types'
import { useProfileDraft } from '@/hooks/useProfileDraft'
import { useAudioImport } from '@/hooks/useAudioImport'
import { audioDraftStore } from '@/stores/audio-draft-store'
import { stageAudio } from '@/services/audio-import'

export function SampleInput() {
  const { profile, addSample, removeSample, saveAudioSample, restoreSample, addDictionaryEntry, updateSample } = useProfile()
  const { runTask, loading, streamedText } = useAI()
  const { connected } = useOllama()
  const { suggestForSample } = useAutoSuggest()
  const { pushAction } = useUndo()
  const { addEntry } = useSessionLog()
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sample: Sample } | null>(null)
  const [autoSuggestion, setAutoSuggestion] = useState('')
  const [alienText, setAlienText] = useProfileDraft<string>('sample.alien', '')
  const [translation, setTranslation] = useProfileDraft<string>('sample.translation', '')
  const [source, setSource] = useProfileDraft<string>('sample.source', SOURCE_PRESETS[0])
  const [phoneticNotes, setPhoneticNotes] = useProfileDraft<string>('sample.notes', '')
  const [parallelMode, setParallelMode] = useProfileDraft<boolean>('sample.parallel', false)
  const [analysisResult, setAnalysisResult] = useState('')
  const [showRecorder, setShowRecorder] = useState(false)
  const [filter, setFilter] = useState<'all' | 'decoded' | 'audio'>('all')
  const [search, setSearch] = useState('')
  const { pendingAudio, preparing, audioError, setAudioError, select: selectAudio, discard } = useAudioImport(profile?.id)
  const [audioSaving, setAudioSaving] = useState(false)
  const [analyzingAudio, setAnalyzingAudio] = useState<'transcribe' | 'phones' | null>(null)
  const [pendingIpa, setPendingIpa] = useProfileDraft<string>('sample.phones', '')
  const [, setPendingMode] = useProfileDraft<string>('sample.audioMode', '')
  const [segmentVersion, setSegmentVersion] = useState(0)
  const [stageId, setStageId] = useProfileDraft<string>('sample.stage', '')
  const [segmentsJson, setSegmentsJson] = useProfileDraft<string>('sample.segments', '[]')
  type Segment = { id: string; start: number; end: number; label: string; dictionary_entry_id?: string | null }
  const pendingSegments: Segment[] = JSON.parse(segmentsJson)
  const setPendingSegments = (next: SetStateAction<Segment[]>) => setSegmentsJson(previous => JSON.stringify(typeof next === 'function' ? next(JSON.parse(previous)) : next))
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [reTranscribing, setReTranscribing] = useState<string | null>(null)

  const samples = profile?.samples || []

  const handleAdd = async () => {
    if (audioSaving || preparing || (!alienText.trim() && !pendingAudio) || !profile) return
    setAudioError('')
    setAudioSaving(true)
    try {
      const sampleText = alienText.trim() || '[audio sample]'
      if (pendingAudio) {
        await audioDraftStore.put(pendingAudio.draft)
        const staged = await stageAudio(pendingAudio, stageId || undefined)
        if (!staged.analysis || !staged.duration) throw new Error('Audio preparation did not finish')
        if (!mounted.current) return
        setStageId(staged.id)
        const metadata = pendingAudio.draft.metadata
        await saveAudioSample(metadata.profileId, {
          id: metadata.sampleId, created_at: metadata.createdAt, alien_text: sampleText,
          english_translation: parallelMode && translation.trim() ? translation.trim() : null,
          source, phonetic_notes: phoneticNotes.trim(), decoded: false, audio_id: staged.id, ipa: pendingIpa || null,
        }, { id: staged.id, created_at: metadata.createdAt, filename: metadata.name, duration: staged.duration,
          waveform: pendingAudio.peaks, segments: pendingSegments.map(s => ({ ...s, dictionary_entry_id: s.dictionary_entry_id ?? null })),
          assets: { original: staged.original, analysis: staged.analysis } })
        if (!mounted.current) return
        await discard()
      } else {
        addSample({ alien_text: sampleText, english_translation: parallelMode && translation.trim() ? translation.trim() : null,
          source, phonetic_notes: phoneticNotes.trim(), decoded: false, audio_id: null, ipa: null })
      }
      if (!mounted.current) return
      if (profile.dictionary.length && sampleText !== '[audio sample]') suggestForSample(sampleText, profile.dictionary, setAutoSuggestion)
      setAlienText(''); setTranslation(''); setPhoneticNotes(''); setPendingSegments([]); setPendingIpa(''); setStageId(''); setPendingMode(''); setShowRecorder(false)
    } catch (error) { if (mounted.current) setAudioError((error as Error).message) }
    finally { if (mounted.current) setAudioSaving(false) }
  }

  const acceptAudio = async (blob: Blob, name: string) => {
    if (await selectAudio(blob, name) && mounted.current) {
      setPendingSegments([]); setPendingIpa(''); setStageId(''); setPendingMode(''); setSource('Audio recording')
    }
  }
  const handleRecordingComplete = (blob: Blob) => { void acceptAudio(blob, 'recording.webm') }
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void acceptAudio(file, file.name)
  }
  const handleAudioAnalysis = async (kind: 'transcribe' | 'phones') => {
    if (!pendingAudio || audioSaving || analyzingAudio) return
    setAnalyzingAudio(kind); setAudioError('')
    try {
      if (kind === 'transcribe') {
        const { transcribe } = await import('@/services/stt')
        const result = await transcribe(pendingAudio.analysis)
        if (!result) throw new Error('Transcription is unavailable. Your original audio is retained.')
        if (!mounted.current) return
        setPendingMode(result.mode)
        setPhoneticNotes(previous => [previous, `Transcript: ${result.text}`].filter(Boolean).join('\n'))
        setPendingSegments(result.segments.filter(s => s.end > s.start && s.start < pendingAudio.duration).map((s, index) => ({
          id: `${pendingAudio.draft.metadata.sampleId}-seg-${index}`, start: s.start, end: Math.min(s.end, pendingAudio.duration), label: s.text,
        })))
      } else {
        const { transcribePhones } = await import('@/services/ipa')
        let failure = 'Phone analysis is unavailable. Your original audio is retained.'
        const result = await transcribePhones(pendingAudio.analysis, message => { failure = message })
        if (!result) throw new Error(failure)
        if (!mounted.current) return
        setPendingIpa(result.ipa); setPendingMode('phones')
        setPendingSegments(result.segments.filter(s => s.end > s.start && s.start < pendingAudio.duration).map((s, index) => ({
          id: `${pendingAudio.draft.metadata.sampleId}-seg-${index}`, start: s.start, end: Math.min(s.end, pendingAudio.duration), label: s.phone,
        })))
      }
      setSegmentVersion(previous => previous + 1)
    } catch (error) { if (mounted.current) setAudioError((error as Error).message) }
    finally { if (mounted.current) setAnalyzingAudio(null) }
  }
  const handleAnalyze = async () => {
    if (!profile) return
    const prompt = `Current dictionary:\n${formatDictionaryForPrompt(profile.dictionary)}\n\nSamples:\n${formatSamplesForPrompt(profile.samples)}`
    setAnalysisResult(await runTask('patternAnalysis', prompt))
  }

  const handlePhoneticAnalysis = async () => {
    if (!profile) return
    const prompt = `Samples:\n${formatSamplesForPrompt(profile.samples)}`
    setAnalysisResult(await runTask('phoneticAnalysis', prompt))
  }

  const getAudioForSample = (audioId: string | null) => (!audioId || !profile ? null : (profile.audio_clips || []).find((c) => c.id === audioId) || null)

  const handleReTranscribe = async (sample: Sample) => {
    if (!sample.audio_id) return
    setReTranscribing(sample.id)
    try {
      const clip = getAudioForSample(sample.audio_id)
      const res = await fetch(`/api/audio/${sample.audio_id}${clip?.assets ? '/analysis' : ''}`)
      if (!res.ok) { addEntry('warning', 'Could not load the stored audio to re-transcribe'); return }
      const blob = await res.blob()
      const { transcribe } = await import('@/services/stt')
      const stt = await transcribe(blob)
      if (!mounted.current) return
      if (!stt) { addEntry('warning', 'Speech-to-text is unavailable on this platform'); return }
      const label = stt.mode === 'transcription' ? 'Transcript' : 'Phonetic guess'
      const line = `${label}: ${stt.text}`
      const prev = sample.phonetic_notes?.trim() ?? ''
      // Replace a prior auto-generated line, but never clobber notes the user typed — append instead.
      const isAuto = /^(Transcript|Phonetic guess):/.test(prev)
      updateSample(sample.id, { phonetic_notes: !prev || isAuto ? line : `${prev}\n${line}` })
      addEntry('info', `Re-transcribed sample (${stt.mode})`)
    } catch {
      addEntry('warning', 'Re-transcription failed; saved audio and notes are retained')
    } finally {
      setReTranscribing(null)
    }
  }

  const handleDeleteWithUndo = (sample: Sample) => {
    if (!profile) return
    const owner = profile.id
    const clip = getAudioForSample(sample.audio_id) ?? undefined
    removeSample(sample.id)
    pushAction({
      description: `Removed sample '${sample.alien_text.slice(0, 30)}${sample.alien_text.length > 30 ? '…' : ''}'`,
      undo: () => restoreSample(owner, sample, clip),
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

        <div className="glass-card" style={{ padding: 18 }} inert={audioSaving || preparing || !!analyzingAudio ? true : undefined}>
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
              <input type="file" accept="audio/wav,audio/webm,.wav,.webm" onChange={handleFileUpload} className="hidden" />
            </label>
            <div className="flex-1" />
            <button className="btn sm ghost" onClick={handleAnalyze} disabled={!connected || loading || !samples.length}>{loading ? 'Analyzing…' : '⌖ AI Auto-decode'}</button>
            <button className="btn sm ghost" onClick={handlePhoneticAnalysis} disabled={!connected || loading || !samples.length}>≈ Phonetic analysis</button>
          </div>

          {showRecorder && <div style={{ marginTop: 12 }}><AudioRecorder onRecordingComplete={handleRecordingComplete} /></div>}

          {pendingAudio && (
            <div className="glass-inner" style={{ padding: 12, marginTop: 12 }}>
              <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="font-mono" style={{ fontSize: 10, color: 'var(--accent)' }}>{pendingAudio.draft.metadata.name} · {pendingAudio.duration.toFixed(1)}s</span>
                <button aria-label="Discard audio draft" onClick={() => { void discard().then(() => { setPendingSegments([]); setStageId(''); setPendingIpa('') }).catch(error => setAudioError(error.message)) }} style={{ background: 'none', border: 0, color: 'var(--fg-mute)', cursor: 'pointer' }}>×</button>
              </div>
              <AudioPlayer src={pendingAudio.blobUrl} peaks={pendingAudio.peaks} duration={pendingAudio.duration} compact />
              <div className="flex" style={{ gap: 8, marginTop: 8, marginBottom: 8 }}>
                <button className="btn sm ghost" onClick={() => { void handleAudioAnalysis('transcribe') }}>Transcribe audio</button>
                <button className="btn sm ghost" onClick={() => { void handleAudioAnalysis('phones') }}>Analyze phones</button>
                <a className="btn sm ghost" href={pendingAudio.blobUrl} download={pendingAudio.draft.metadata.name}>Download original</a>
              </div>
              <AudioSegmenter key={`${pendingAudio.blobUrl}-${segmentVersion}`} src={pendingAudio.blobUrl} peaks={pendingAudio.peaks}
                duration={pendingAudio.duration}
                initialSegments={pendingSegments.map(s => ({ ...s, start: s.start / pendingAudio.duration, end: s.end / pendingAudio.duration }))}
                onSegmentsChange={segments => setPendingSegments(previous => segments.map(segment => ({ ...segment,
                  dictionary_entry_id: previous.find(old => old.id === segment.id)?.dictionary_entry_id ?? null }))) } />
              {pendingSegments.length > 0 && (
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
                            const entryId = addDictionaryEntry({ alien_word: s.label, english_meaning: '', part_of_speech: 'unknown', confidence: null, context: 'From audio transcript', examples: [], notes: '' })
                            // Persist the link onto the saved AudioSegment when the sample is added.
                            setPendingSegments((prev) => prev.map((seg) => seg.id === s.id ? { ...seg, dictionary_entry_id: entryId } : seg))
                          }}
                        >
                          {known ? `✓ ${s.label}` : `+ ${s.label}`}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {pendingIpa && (
                <div className="glass-inner" style={{ padding: 10, marginTop: 10 }}>
                  <span className="label" style={{ marginBottom: 4, display: 'block' }}>ARPABET phones · English-trained model</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-1)' }}>{pendingIpa}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {(preparing || audioSaving || analyzingAudio) && <p role="status">{preparing ? 'Preparing audio…' : audioSaving ? 'Saving audio and sample…' : 'Analyzing audio…'}</p>}
        {audioError && <p role="alert" className="text-xs text-amber-300">{audioError}</p>}
        <p className="dim" style={{ fontSize: 11 }}>PCM16 WAV or WebM/Opus · up to 32 MiB and 2 minutes. Original audio is preserved.</p>
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
                          <button aria-label={`Delete sample ${sample.alien_text}`} onClick={(e) => { e.stopPropagation(); handleDeleteWithUndo(sample) }} style={{ background: 'none', border: 0, color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 13 }}>×</button>
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color: 'var(--fg)', letterSpacing: '-0.005em', lineHeight: 1.4 }}>{sample.alien_text}</div>
                      {sample.english_translation && <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--fg-dim)', marginTop: 4 }}>→ {sample.english_translation}</div>}
                      {clip && <div onClick={e => e.stopPropagation()} style={{ marginTop: 8 }}>
                        <AudioPlayer src={`/api/audio/${clip.id}`} peaks={clip.waveform} duration={clip.duration} compact />
                        <a href={`/api/audio/${clip.id}`} download={clip.filename} className="btn xs ghost">Download original</a>
                      </div>}
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
