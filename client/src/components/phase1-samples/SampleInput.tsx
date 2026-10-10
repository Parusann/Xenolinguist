import { AUDIO_LIMITS } from 'shared/audio-limits'
import { TRANSCRIPTION_HISTORY_LIMIT, type TranscriptionAnalysis } from 'shared/schemas/transcription'
import { retainableTranscriptionAnalysis, retainableTranscriptionHistory } from '@/services/transcription-annotations'
import { manualTranscriptionSegments } from 'shared/transcription-annotations'
import { TranscriptionHistory } from '@/components/audio/TranscriptionHistory'
import { useEffect, useRef, useState, useMemo, type SetStateAction } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'
import { useAutoSuggest } from '@/hooks/useAutoSuggest'
import { useUndo } from '@/stores/undo-context'
import { useSessionLog } from '@/stores/session-log-context'
import { SOURCE_PRESETS } from 'shared/constants'
import { formatSamplesForPrompt } from 'shared/prompts'
import { useProposalReview } from '@/stores/proposal-review-context'
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
import { PhoneAnalysisHistory } from '@/components/audio/PhoneAnalysisHistory'
import { SavedPhoneAnnotations } from '@/components/audio/SavedPhoneAnnotations'
import { PHONE_HISTORY_LIMIT, type PhoneAnalysis } from 'shared/schemas/phone-analysis'
import { retainablePhoneAnalysis, retainablePhoneHistory } from '@/services/phone-annotations'
import { manualPhoneSegments } from 'shared/phone-annotations'

import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/common/Pagination'
import { normalize } from 'engine/text/normalize'
import { useLexicon } from '@/hooks/useLexicon'
const EMPTY_SAMPLES: Sample[] = []

export function SampleInput() {
  const { profile, addSample, removeSample, saveAudioSample, restoreSample, addDictionaryEntry, retainTranscriptionAnalysis } = useProfile()
  const lexicon = useLexicon(profile)
  const { runTask, loading, streamedText, error: analysisError } = useAI()
  const { ready: connected } = useOllama()
  const sampleReview = useAutoSuggest()
  const openResearch = useProposalReview()
  const { pushAction } = useUndo()
  const { addEntry } = useSessionLog()
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sample: Sample } | null>(null)
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
  const [phoneHistoryJson, setPhoneHistoryJson] = useProfileDraft<string>('sample.phoneHistory', '[]')
  const [manualSource, setManualSource] = useProfileDraft<string>('sample.manualSource', '')
  const [transcriptionHistoryJson, setTranscriptionHistoryJson] = useProfileDraft<string>('sample.transcriptionHistory', '[]')
  const [manualTranscriptionSource, setManualTranscriptionSource] = useProfileDraft<string>('sample.manualTranscriptionSource', '')
  const transcriptionHistory: TranscriptionAnalysis[] = JSON.parse(transcriptionHistoryJson)
  const phoneHistory: PhoneAnalysis[] = JSON.parse(phoneHistoryJson)
  type Segment = { id: string; start: number; end: number; label: string; dictionary_entry_id?: string | null }
  const pendingSegments: Segment[] = JSON.parse(segmentsJson)
  const setPendingSegments = (next: SetStateAction<Segment[]>) => setSegmentsJson(previous => JSON.stringify(typeof next === 'function' ? next(JSON.parse(previous)) : next))
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [reTranscribing, setReTranscribing] = useState<string | null>(null)

  const samples = profile?.samples ?? EMPTY_SAMPLES

  const handleAdd = async () => {
    if (audioSaving || preparing || analyzingAudio || (!alienText.trim() && !pendingAudio) || !profile) return
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
          assets: { original: staged.original, analysis: staged.analysis }, phone_analyses: phoneHistory, transcriptions: transcriptionHistory,
          ...(manualTranscriptionSource ? { manual_source_transcription_id: manualTranscriptionSource } : {}),
          ...(manualSource ? { manual_source_analysis_id: manualSource } : {}) })
        if (!mounted.current) return
        await discard()
      } else {
        addSample({ alien_text: sampleText, english_translation: parallelMode && translation.trim() ? translation.trim() : null,
          source, phonetic_notes: phoneticNotes.trim(), decoded: false, audio_id: null, ipa: null })
      }
      if (!mounted.current) return
      if (sampleText !== '[audio sample]') sampleReview.suggestForSample(sampleText)
      setAlienText(''); setTranslation(''); setPhoneticNotes(''); setPendingSegments([]); setPendingIpa(''); setStageId(''); setPendingMode(''); setShowRecorder(false)
      setPhoneHistoryJson('[]'); setManualSource(''); setTranscriptionHistoryJson('[]'); setManualTranscriptionSource('')
    } catch (error) { if (mounted.current) setAudioError((error as Error).message) }
    finally { if (mounted.current) setAudioSaving(false) }
  }

  const acceptAudio = async (blob: Blob, name: string) => {
    if (await selectAudio(blob, name) && mounted.current) {
      setPendingSegments([]); setPendingIpa(''); setStageId(''); setPendingMode(''); setSource('Audio recording')
      setPhoneHistoryJson('[]'); setManualSource(''); setTranscriptionHistoryJson('[]'); setManualTranscriptionSource('')
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
        if (pendingAudio.duration > AUDIO_LIMITS.transcriptionSeconds) throw new Error('Transcription supports recordings up to 2 minutes. Phone analysis supports up to 5 minutes.')
        if (transcriptionHistory.length >= TRANSCRIPTION_HISTORY_LIMIT) throw new Error('This recording already has eight retained transcriptions. Existing results are preserved.')
        const staged = await stageAudio(pendingAudio, stageId || undefined)
        if (!mounted.current) return
        setStageId(staged.id)
        const response = await fetch(`/api/audio/${staged.id}/analysis`)
        if (!response.ok) throw new Error('Could not load the prepared recording')
        const { transcribe } = await import('@/services/stt')
        const result = await transcribe(await response.blob(), { preparedWav: true })
        if (!result) throw new Error('Transcription is unavailable. Your original audio is retained.')
        if (!mounted.current) return
        if (result.audio.sha256 !== staged.analysis?.sha256) throw new Error('Transcription does not match the prepared recording')
        const analysis = retainableTranscriptionAnalysis(staged.original.sha256, result)
        setTranscriptionHistoryJson(previous => retainableTranscriptionHistory([...JSON.parse(previous), analysis]))
      } else {
        if (phoneHistory.length >= PHONE_HISTORY_LIMIT) throw new Error('This recording already has eight retained analyses. Existing results are preserved.')
        const staged = await stageAudio(pendingAudio, stageId || undefined)
        if (!mounted.current) return
        setStageId(staged.id)
        // Always analyze the retained derivative, including after recovery on another audio device.
        const response = await fetch(`/api/audio/${staged.id}/analysis`)
        if (!response.ok) throw new Error('Could not load the prepared recording')
        const { transcribePhones } = await import('@/services/ipa')
        let failure = 'Phone analysis is unavailable. Your original audio is retained.'
        const result = await transcribePhones(await response.blob(), message => { failure = message })
        if (!result) throw new Error(failure)
        if (!mounted.current) return
        const analysis = retainablePhoneAnalysis(staged.original.sha256, result)
        if (result.audio?.sha256 !== staged.analysis?.sha256) throw new Error('Phone analysis does not match the prepared recording')
        setPhoneHistoryJson(previous => retainablePhoneHistory([...JSON.parse(previous), analysis]))
      }
      setSegmentVersion(previous => previous + 1)
    } catch (error) { if (mounted.current) setAudioError((error as Error).message) }
    finally { if (mounted.current) setAnalyzingAudio(null) }
  }
  const handleAnalyze = () => openResearch('Investigate patterns in captured samples. Propose a lexical sense, executable grammar rule, or observation that distinguishes alternatives. Cite exact evidence.')

  const handlePhoneticAnalysis = async () => {
    if (!profile) return
    const prompt = `Samples:\n${formatSamplesForPrompt(profile.samples)}`
    try { setAnalysisResult(await runTask('phoneticAnalysis', prompt)) }
    catch { /* useAI retains and displays the failed analysis. */ }
  }

  const getAudioForSample = (audioId: string | null) => (!audioId || !profile ? null : (profile.audio_clips || []).find((c) => c.id === audioId) || null)

  const handleReTranscribe = async (sample: Sample) => {
    if (!sample.audio_id || !profile || reTranscribing) return
    const owner = profile.id, clip = getAudioForSample(sample.audio_id)
    if (!clip?.assets) { addEntry('warning', 'Import legacy audio as a new recording to retain verified transcription history'); return }
    if (clip.duration > AUDIO_LIMITS.transcriptionSeconds) { addEntry('warning', 'Transcription supports recordings up to 2 minutes'); return }
    if ((clip.transcriptions?.length ?? 0) >= TRANSCRIPTION_HISTORY_LIMIT) { addEntry('warning', 'This recording already has eight retained transcriptions'); return }
    setReTranscribing(sample.id)
    try {
      const res = await fetch(`/api/audio/${clip.id}/analysis`)
      if (!res.ok) throw new Error('Could not load the prepared recording')
      const { transcribe } = await import('@/services/stt')
      const result = await transcribe(await res.blob(), { preparedWav: true })
      if (!mounted.current) return
      if (!result) throw new Error('Transcription failed; saved audio and notes are retained')
      await retainTranscriptionAnalysis(owner, clip.id, retainableTranscriptionAnalysis(clip.assets.original.sha256, result))
      if (mounted.current) addEntry('info', 'Transcription retained separately from manual annotations')
    } catch (error) { if (mounted.current) addEntry('warning', (error as Error).message) }
    finally { if (mounted.current) setReTranscribing(null) }
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
  const visible = useMemo(() => samples.filter((s) => {
    if (filter === 'decoded' && !s.decoded) return false
    if (filter === 'audio' && !s.audio_id) return false
    if (search && !normalize(s.alien_text, lexicon.policy).includes(normalize(search, lexicon.policy)) && !normalize(s.english_translation || '', lexicon.policy).includes(normalize(search, lexicon.policy))) return false
    return true
  }), [samples, filter, search, lexicon.policy])
  const pagination = usePagination(visible, `${filter}:${search}`)

  return (
    <div className="phase-enter phase-columns" style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 560px) 1fr', gap: 20, height: '100%', overflow: 'hidden' }}>
      {/* LEFT — capture */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto', paddingRight: 4 }}>
        <div>
          <div className="flex" style={{ alignItems: 'baseline', gap: 12 }}>
            <h1 className="h-display" style={{ margin: 0, fontSize: 30 }}>Language <em>Samples</em></h1>
            <span className="kicker">PHASE 01</span>
          </div>
          <p className="dim" style={{ marginTop: 6, fontSize: 13 }}>Capture raw alien text. Tag the source, add phonetic notes, attach audio.</p>
        </div>

        <fieldset className="glass-card" aria-label="New sample" style={{ padding: 18, margin: 0, minWidth: 0 }} disabled={audioSaving || preparing || !!analyzingAudio} inert={audioSaving || preparing || !!analyzingAudio ? true : undefined}>
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="label" style={{ marginBottom: 0 }}>New Sample</span>
            <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--fg-dim)', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={parallelMode} onChange={(e) => setParallelMode(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 13, height: 13 }} />
              Parallel mode
            </label>
          </div>

          <textarea aria-label="Unknown language sample" className="textarea" value={alienText} onChange={(e) => setAlienText(e.target.value)} placeholder="Enter unknown language text… e.g. nesh tor krash." style={{ marginTop: 12, minHeight: 96, fontSize: 15 }} />
          {parallelMode && (
            <textarea aria-label="Known English translation" className="textarea" value={translation} onChange={(e) => setTranslation(e.target.value)} placeholder="Known English translation…" style={{ marginTop: 10, minHeight: 60, fontFamily: 'var(--font-sans)' }} />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <label className="label">Source</label>
              <select aria-label="Sample source" className="input" value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="Audio recording">Audio recording</option>
              </select>
            </div>
            <div>
              <label className="label">Phonetic Notes</label>
              <input aria-label="Phonetic notes" className="input" value={phoneticNotes} onChange={(e) => setPhoneticNotes(e.target.value)} placeholder="IPA, tone markers" />
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
            <button className="btn sm ghost" onClick={handleAnalyze}>Review sample proposal</button>
            <button className="btn sm ghost" onClick={handlePhoneticAnalysis} disabled={!connected || loading || !samples.length}>≈ Phonetic analysis</button>
          </div>

          {showRecorder && <div style={{ marginTop: 12 }}><AudioRecorder onRecordingComplete={handleRecordingComplete} /></div>}

          {pendingAudio && (
            <div className="glass-inner" style={{ padding: 12, marginTop: 12 }}>
              <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="font-mono" style={{ fontSize: 10, color: 'var(--accent)' }}>{pendingAudio.draft.metadata.name} · {pendingAudio.duration.toFixed(1)}s</span>
                <button aria-label="Discard audio draft" disabled={Boolean(analyzingAudio)} onClick={() => { void discard().then(() => { setPendingSegments([]); setStageId(''); setPendingIpa(''); setPhoneHistoryJson('[]'); setManualSource(''); setTranscriptionHistoryJson('[]'); setManualTranscriptionSource('') }).catch(error => setAudioError(error.message)) }} style={{ background: 'none', border: 0, color: 'var(--fg-mute)', cursor: 'pointer' }}>×</button>
              </div>
              <AudioPlayer src={pendingAudio.blobUrl} peaks={pendingAudio.peaks} duration={pendingAudio.duration} compact />
              <div className="flex" style={{ gap: 8, marginTop: 8, marginBottom: 8 }}>
                <button className="btn sm ghost" disabled={Boolean(analyzingAudio) || pendingAudio.duration > AUDIO_LIMITS.transcriptionSeconds} onClick={() => { void handleAudioAnalysis('transcribe') }}>Transcribe audio</button>
                <button className="btn sm ghost" disabled={Boolean(analyzingAudio)} onClick={() => { void handleAudioAnalysis('phones') }}>{pendingAudio.duration > AUDIO_LIMITS.transcriptionSeconds ? 'Queue long phone analysis' : 'Analyze phones'}</button>
                <a className="btn sm ghost" href={pendingAudio.blobUrl} download={pendingAudio.draft.metadata.name}>Download original</a>
              </div>
              {pendingAudio.duration > AUDIO_LIMITS.transcriptionSeconds && <p className="dim">Long recording: phone analysis uses the shared queue. Follow progress or cancel in Runtime &amp; setup. Transcription supports up to 2 minutes.</p>}
              <TranscriptionHistory history={transcriptionHistory} onCopy={analysis => {
                setPendingSegments(manualTranscriptionSegments(analysis, () => crypto.randomUUID()))
                setManualTranscriptionSource(analysis.id); setManualSource(''); setSegmentVersion(previous => previous + 1)
              }} />
              <PhoneAnalysisHistory history={phoneHistory} onCopy={analysis => {
                setPendingSegments(manualPhoneSegments(analysis, () => crypto.randomUUID())); setPendingIpa(analysis.result.ipa)
                setManualSource(analysis.id); setManualTranscriptionSource(''); setSegmentVersion(previous => previous + 1)
              }} />
              <p className="label">Manual segments</p>
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
                      const known = lexicon.lookup(s.label)
                      return (
                        <button
                          key={s.id}
                          className="btn xs ghost"
                          title={known.length ? `Dictionary candidates: ${known.map(candidate => candidate.meaning).join(' | ')}` : 'Add to dictionary'}
                          style={{ color: known.length ? 'var(--accent)' : undefined }}
                          onClick={() => {
                            if (known.length || !s.label.trim()) return
                            const entryId = addDictionaryEntry({ alien_word: s.label, english_meaning: '', part_of_speech: 'unknown', confidence: null, context: 'From audio transcript', examples: [], notes: '' })
                            // Persist the link onto the saved AudioSegment when the sample is added.
                            setPendingSegments((prev) => prev.map((seg) => seg.id === s.id ? { ...seg, dictionary_entry_id: entryId } : seg))
                          }}
                        >
                          {known.length ? `✓ ${s.label}` : `+ ${s.label}`}
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
        </fieldset>

        {(preparing || audioSaving || analyzingAudio) && <p role="status">{preparing ? 'Preparing audio…' : audioSaving ? 'Saving audio and sample…' : 'Analyzing audio…'}</p>}
        {audioError && <p role="alert" className="text-xs text-amber-300">{audioError}</p>}
        <p className="dim" style={{ fontSize: 11 }}>PCM16 WAV or WebM/Opus · imports up to 32 MiB and 5 minutes. Microphone recording and transcription: up to 2 minutes. Original audio is preserved.</p>
        {sampleReview.sampleText && (
          <div className="glass-card slide-up" style={{ padding: 14 }}>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="label">Sample saved for investigation</span>
              <button onClick={sampleReview.dismiss} style={{ background: 'none', border: 0, color: 'var(--fg-mute)', fontSize: 11, cursor: 'pointer' }}>Dismiss sample review</button>
            </div>
            <p className="dim">Capture the source evidence, then select supplied targets and review a proposal. Saving a sample does not start model inference.</p>
            <button className="btn sm" onClick={sampleReview.review}>Investigate saved sample</button>
          </div>
        )}

        {analysisError && <p role="alert">{analysisError}</p>}
        {(loading || analysisResult) && (
          <div className={`glass-card ${loading ? 'scan-overlay' : ''}`} style={{ padding: 14 }}>
            <div className="flex" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}><span className="dot" style={{ background: 'var(--ai)', boxShadow: '0 0 6px var(--ai)' }} /><span className="label" style={{ color: 'var(--ai)', marginBottom: 0 }}>{loading ? 'Analyzing text' : 'Unvalidated phonetic commentary'}</span></div>
            <pre style={{ fontSize: 12.5, color: 'var(--fg-1)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.6, margin: 0 }}>{loading ? streamedText : analysisResult}</pre>
          </div>
        )}
      </div>

      {/* RIGHT — samples list / decode view */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        {selectedSample && profile ? (
          <SampleDecodeView sample={selectedSample} profile={profile} onClose={() => setSelectedSample(null)} onDefineWord={(entry) => addDictionaryEntry(entry)} />
        ) : (
          <>
            <div className="flex" style={{ gap: 10, alignItems: 'center' }}>
              <span className="label" style={{ marginBottom: 0 }}>Samples</span>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fg-mute)' }}>{samples.length} total · {decodedCount} decoded</span>
              <div className="flex-1" />
              <input aria-label="Search samples" className="input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 180, padding: '6px 10px' }} />
              {(['all', 'decoded', 'audio'] as const).map((f) => (
                <button key={f} className="btn xs ghost" onClick={() => setFilter(f)} style={{ background: filter === f ? 'rgba(0,230,118,0.10)' : 'transparent', color: filter === f ? 'var(--accent)' : 'var(--fg-dim)', textTransform: 'capitalize' }}>{f === 'audio' ? 'With audio' : f}</button>
              ))}
            </div>

            <Pagination {...pagination} label="samples" />
            {samples.length === 0 ? (
              <div className="glass-card" style={{ padding: 32, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>No samples yet. Capture your first sample using the form.</div>
            ) : (
              <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4, paddingBottom: 10 }}>
                {pagination.items.map((sample, i) => {
                  const clip = getAudioForSample(sample.audio_id)
                  return (
                    <div key={sample.id} className="glass-card" style={{ padding: 14, cursor: 'pointer' }} onClick={() => setSelectedSample(sample)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, sample }) }}>
                      <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8, alignItems: 'center', gap: 8 }}>
                        <div className="flex" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="badge" style={{ fontSize: 9 }}>S{String(pagination.page * pagination.size + i + 1).padStart(2, '0')}</span>
                          <span className={'badge ' + (sample.decoded ? 'confirmed' : 'unknown')}>{sample.decoded ? 'decoded' : 'raw'}</span>
                          <span className="badge" style={{ fontSize: 9 }}>{sample.source}</span>
                          {sample.audio_id && <span className="badge" style={{ fontSize: 9 }}>♪ audio</span>}
                        </div>
                        <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
                          <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-mute)' }}>{new Date(sample.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}</span>
                          {sample.audio_id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleReTranscribe(sample) }}
                              title="Re-transcribe audio" disabled={Boolean(reTranscribing) || (getAudioForSample(sample.audio_id)?.duration ?? 0) > AUDIO_LIMITS.transcriptionSeconds}
                              style={{ background: 'none', border: 0, color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12 }}
                            >
                              {reTranscribing === sample.id ? '…' : '↻'}
                            </button>
                          )}
                          <button aria-label={`Delete sample ${sample.alien_text}`} onClick={(e) => { e.stopPropagation(); handleDeleteWithUndo(sample) }} style={{ background: 'none', border: 0, color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 13 }}>×</button>
                        </div>
                      </div>
                      <button type="button" className="sample-open" onClick={e => { e.stopPropagation(); setSelectedSample(sample) }} style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 17, color: 'var(--fg)', letterSpacing: '-0.005em', lineHeight: 1.4 }}>{sample.alien_text}</button>
                      {sample.english_translation && <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--fg-dim)', marginTop: 4 }}>→ {sample.english_translation}</div>}
                      {clip && <div onClick={e => e.stopPropagation()} style={{ marginTop: 8 }}>
                        <AudioPlayer src={`/api/audio/${clip.id}`} peaks={clip.waveform} duration={clip.duration} compact />
                        <a href={`/api/audio/${clip.id}`} download={clip.filename} className="btn xs ghost">Download original</a>
                        <SavedPhoneAnnotations key={clip.id} clip={clip} profileId={profile!.id} />
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
