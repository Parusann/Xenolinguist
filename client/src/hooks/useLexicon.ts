import { useMemo } from 'react'
import type { LanguageProfile } from 'shared/types'
import { LexiconIndex, profileLexicon } from 'engine/lexicon/index'

const empty = new LexiconIndex([])
export function useLexicon(profile: LanguageProfile | null) {
  return useMemo(() => profile ? profileLexicon(profile) : empty, [profile])
}
