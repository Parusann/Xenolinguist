import { useEffect, useRef, useState } from 'react'
import { audioDraftStore, beginAudioPreparation, type AudioDraft } from '@/stores/audio-draft-store'
import { prepareAudio, type PreparedAudio } from '@/services/audio-import'
export interface PendingAudio extends PreparedAudio { draft: AudioDraft; blobUrl: string }
export function useAudioImport(profileId: string | undefined) {
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null)
  // Recovery starts with the first render, before effects can make the form inert.
  const [preparing, setPreparing] = useState(Boolean(profileId))
  const [audioError, setAudioError] = useState('')
  const generation = useRef(0), currentUrl = useRef('')
  useEffect(() => {
    if (!profileId) return
    const version = ++generation.current
    setPreparing(true)
    setPendingAudio(null)
    void audioDraftStore.load(profileId).then(async draft => {
      if (!draft || version !== generation.current) return
      const prepared = await prepareAudio(draft.blob)
      if (version !== generation.current) return
      currentUrl.current = URL.createObjectURL(prepared.blob)
      setPendingAudio({ ...prepared, draft, blobUrl: currentUrl.current })
    }).catch(error => { if (version === generation.current) setAudioError(`Draft recovery failed: ${error.message}. Stored audio has been preserved.`) })
      .finally(() => { if (version === generation.current) setPreparing(false) })
    const cancel = () => { ++generation.current; URL.revokeObjectURL(currentUrl.current) }
    return cancel
  }, [profileId])
  async function select(blob: Blob, name: string) {
    if (!profileId) return false
    const version = ++generation.current
    setPreparing(true); setAudioError('')
    const finish = beginAudioPreparation()
    try {
      let draft: AudioDraft | undefined
      const prepared = await prepareAudio(blob, async mime => {
        if (version !== generation.current) throw new Error('Audio preparation was interrupted')
        draft = { metadata: { profileId, name: name.slice(0, 255), mime, sampleId: `sample-${crypto.randomUUID()}`, createdAt: new Date().toISOString() }, blob: new Blob([blob], { type: mime }) }
        try { await audioDraftStore.put(draft) } catch { if (version === generation.current) setAudioError('Local audio storage failed. Keep this window open and retry Add Sample.') }
      })
      if (version !== generation.current) return false
      if (!draft) throw new Error('Audio draft was not prepared')
      URL.revokeObjectURL(currentUrl.current); currentUrl.current = URL.createObjectURL(prepared.blob)
      setPendingAudio({ ...prepared, draft, blobUrl: currentUrl.current }); return true
    } catch (error) { if (version === generation.current) setAudioError((error as Error).message); return false }
    finally { finish(); if (version === generation.current) setPreparing(false) }
  }
  async function discard() {
    if (!profileId) return
    await audioDraftStore.remove(profileId)
    ++generation.current; URL.revokeObjectURL(currentUrl.current); currentUrl.current = ''; setPendingAudio(null)
  }
  return { pendingAudio, preparing, audioError, setAudioError, select, discard }
}
