import { TranscriptionHistory } from './TranscriptionHistory'
import { manualTranscriptionSegments } from 'shared/transcription-annotations'
import { useEffect, useRef, useState } from 'react'
import type { AudioClip } from 'shared/types'
import { PHONE_HISTORY_LIMIT, type PhoneAnalysis } from 'shared/schemas/phone-analysis'
import { retainablePhoneAnalysis } from '@/services/phone-annotations'
import { manualPhoneSegments } from 'shared/phone-annotations'
import { useProfile } from '@/stores/profile-context'
import { transcribePhones } from '@/services/ipa'
import { PhoneAnalysisHistory } from './PhoneAnalysisHistory'
import { AudioSegmenter } from './AudioSegmenter'

export function SavedPhoneAnnotations({ clip, profileId }: { clip: AudioClip; profileId: string }) {
  const { retainPhoneAnalysis, updateAudioClip } = useProfile()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [version, setVersion] = useState(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function analyze() {
    if (busy || !clip.assets) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/audio/${clip.id}/analysis`)
      if (!response.ok) throw new Error('Could not load the prepared recording')
      let failure = 'Phone analysis is unavailable'
      const result = await transcribePhones(await response.blob(), message => { failure = message })
      if (!result) throw new Error(failure)
      if (!mounted.current) return
      const analysis = retainablePhoneAnalysis(clip.assets.original.sha256, result)
      await retainPhoneAnalysis(profileId, clip.id, analysis)
    } catch (reason) { if (mounted.current) setError((reason as Error).message) }
    finally { if (mounted.current) setBusy(false) }
  }
  function copy(analysis: PhoneAnalysis) {
    updateAudioClip(clip.id, { segments: manualPhoneSegments(analysis, () => crypto.randomUUID()), manual_source_analysis_id: analysis.id, manual_source_transcription_id: undefined })
    setVersion(value => value + 1)
  }
  return <details aria-label="Recording annotation layers">
    <summary>Generated analyses and manual segments</summary>
    <button className="btn sm ghost" disabled={busy || !clip.assets || (clip.phone_analyses?.length ?? 0) >= PHONE_HISTORY_LIMIT} onClick={() => { void analyze() }}>
      {busy ? 'Analyzing saved phones…' : 'Analyze saved phones'}
    </button>
    {!clip.assets && <p>Legacy recording: verified prepared audio is required to retain phone analysis. Import the original as a new recording.</p>}
    <p className="dim">Up to eight analyses and 4 MiB per recording. Existing results are never silently pruned.</p>
    {error && <p role="alert">{error}</p>}
    <TranscriptionHistory history={clip.transcriptions ?? []} onCopy={analysis => {
      updateAudioClip(clip.id, { segments: manualTranscriptionSegments(analysis, () => crypto.randomUUID()),
        manual_source_transcription_id: analysis.id, manual_source_analysis_id: undefined })
      setVersion(value => value + 1)
    }} />
    <PhoneAnalysisHistory history={clip.phone_analyses ?? []} onCopy={copy} />
    <p className="label">Manual segments</p>
    <AudioSegmenter key={version} src={`/api/audio/${clip.id}`} peaks={clip.waveform} duration={clip.duration}
      initialSegments={clip.segments.map(s => ({ ...s, start: s.start / clip.duration, end: s.end / clip.duration }))}
      onSegmentsChange={segments => updateAudioClip(clip.id, { segments: segments.map(s => ({ ...s,
        dictionary_entry_id: clip.segments.find(old => old.id === s.id)?.dictionary_entry_id ?? null })) })} />
  </details>
}
